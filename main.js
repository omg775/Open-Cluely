require("dotenv").config();

const { app, BrowserWindow, globalShortcut, session, ipcMain } = require("electron");
const logger = require("./src/core/logger").createServiceLogger("MAIN");
const config = require("./src/core/config");

// Keep Chromium network noise out of the terminal; app-level logs still go through Winston.
app.commandLine.appendSwitch("log-level", "3");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
app.commandLine.appendSwitch("no-pings");

// Services
// Screen capture (image-based)
const captureService = require("./src/services/capture.service");
const speechService = require("./src/services/speech.service");
const llmService = require("./src/services/llm.service");
const accountService = require("./src/services/account.service");

// Managers
const windowManager = require("./src/managers/window.manager");
const sessionManager = require("./src/managers/session.manager");

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.sessionFlushed = false;
    this.activeSkill = "dsa";
    // Default to C++ so language is enforced from first run
    this.codingLanguage = "cpp";
    this.speechAvailable = false;

    // Window configurations for reference
    this.windowConfigs = {
      main: { title: "OpenCluely" },
      chat: { title: "Chat" },
      llmResponse: { title: "AI Response" },
      settings: { title: "Settings" },
    };

    // Pending transcript text waiting for the debounce window to close
    this.pendingTranscript = null;
    this.transcriptDebounceTimer = null;

    this.setupProcessDisguise();
    this.setupEventHandlers();

    // Load persisted settings (including the Anthropic key) as soon as controller is constructed
    try {
      this.loadPersistedSettings();
    } catch (e) {
      logger.debug('No persisted settings loaded at startup', { error: e.message });
    }
  }

  setupProcessDisguise() {
    if (config.get("overlay.disguiseProcess")) {
      process.title = config.get("app.processTitle");
    }

    // Keep the overlay out of the dock/taskbar under a neutral name
    if (app && typeof app.setName === 'function') {
      app.setName("Terminal ");
    }
    process.title = "Terminal ";

    if (
      process.platform === "darwin" &&
      config.get("overlay.noAttachConsole")
    ) {
      process.env.ELECTRON_NO_ATTACH_CONSOLE = "1";
      process.env.ELECTRON_NO_ASAR = "1";
    }
  }

  setupEventHandlers() {
    // macOS delivers opencluely:// links through open-url, which can fire
    // before the app is ready.
    app.on("open-url", (event, url) => {
      event.preventDefault();
      this.handleDeepLink(url);
    });

    // Reporting the session end is a network round trip, so quitting is held
    // back until it has been flushed.
    app.on("before-quit", event => {
      if (this.sessionFlushed || !accountService.hasUnreportedSession()) return;

      event.preventDefault();
      accountService.endSession().finally(() => {
        this.sessionFlushed = true;
        app.quit();
      });
    });

    app.whenReady().then(() => this.onAppReady());
    app.on("window-all-closed", () => this.onWindowAllClosed());
    app.on("activate", () => this.onActivate());
    app.on("will-quit", () => this.onWillQuit());

    this.setupIPCHandlers();
    this.setupServiceEventHandlers();
  }

  handleSecondInstance(argv = []) {
    logger.info("Second instance launch detected; focusing existing windows");

    const deepLink = accountService.findDeepLink(argv);
    if (deepLink) this.handleDeepLink(deepLink);

    const focusExistingWindows = () => {
      try {
        const mainWindow = windowManager.getWindow("main");
        if (mainWindow) {
          if (mainWindow.isMinimized && mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          windowManager.showAllWindows();
          windowManager.showOnCurrentDesktop(mainWindow);
          mainWindow.focus();
          return;
        }

        if (this.isReady) {
          windowManager.showAllWindows();
        }
      } catch (error) {
        logger.error("Failed to focus existing instance", {
          error: error.message,
        });
      }
    };

    if (app.isReady()) {
      focusExistingWindows();
    } else {
      app.whenReady().then(focusExistingWindows);
    }
  }

  async onAppReady() {
    app.setName("Terminal ");
    process.title = "Terminal ";

    logger.info("Application starting", {
      version: config.get("app.version"),
      environment: config.get("app.isDevelopment")
        ? "development"
        : "production",
      platform: process.platform,
    });

    try {
      this.setupPermissions();
      accountService.registerProtocol();

      // Small delay to ensure desktop/space detection is accurate
      await new Promise((resolve) => setTimeout(resolve, 200));

      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();

      this.updateAppIcon("terminal");

      this.isReady = true;

      logger.info("Application initialized successfully", {
        windowCount: Object.keys(windowManager.getWindowStats().windows).length,
        currentDesktop: "detected",
      });

      sessionManager.addEvent("Application started");

      const deepLink = accountService.findDeepLink(process.argv);
      if (deepLink) {
        this.handleDeepLink(deepLink);
      } else if (accountService.load()) {
        this.syncAccountConfig();
      }
    } catch (error) {
      logger.error("Application initialization failed", {
        error: error.message,
      });
      app.quit();
    }
  }

  setupPermissions() {
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const allowedPermissions = ["microphone", "camera", "display-capture"];
        const granted = allowedPermissions.includes(permission);

        logger.debug("Permission request", { permission, granted });
        callback(granted);
      }
    );
  }

  setupGlobalShortcuts() {
    const shortcuts = {
      "CommandOrControl+Shift+S": () => this.triggerScreenshotOCR(),
      "CommandOrControl+Shift+V": () => windowManager.toggleVisibility(),
      "CommandOrControl+Shift+I": () => windowManager.toggleInteraction(),
      "CommandOrControl+Shift+C": () => windowManager.switchToWindow("chat"),
      "CommandOrControl+Shift+\\": () => this.clearSessionMemory(),
      "CommandOrControl+,": () => windowManager.showSettings(),
      "Alt+A": () => windowManager.toggleInteraction(),
      "Alt+R": () => this.toggleSpeechRecognition(),
      "CommandOrControl+Shift+T": () => windowManager.forceAlwaysOnTopForAllWindows(),
      "CommandOrControl+Shift+Alt+T": () => {
        const results = windowManager.testAlwaysOnTopForAllWindows();
        logger.info('Always-on-top test triggered via shortcut', results);
      },
      // Context-sensitive shortcuts based on interaction mode
      "CommandOrControl+Up": () => this.handleUpArrow(),
      "CommandOrControl+Down": () => this.handleDownArrow(),
      "CommandOrControl+Left": () => this.handleLeftArrow(),
      "CommandOrControl+Right": () => this.handleRightArrow(),
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.debug("Global shortcut registered", { accelerator, success });
    });
  }

  /**
   * Link this app to a dashboard account from an opencluely:// launch link and
   * apply the account's key, model and grounding documents.
   */
  async handleDeepLink(deepLink) {
    try {
      logger.info("Handling launch link");
      const payload = await accountService.handleDeepLink(deepLink);
      this.applyAccountPayload(payload);
      this.broadcastAccountStatus(`Linked to ${accountService.getStatus().email || "your OpenCluely account"}`);
    } catch (error) {
      logger.error("Failed to handle launch link", { error: error.message });
      this.broadcastAccountStatus(`Launch link failed: ${error.message}`, true);
    }
  }

  async syncAccountConfig() {
    try {
      this.applyAccountPayload(await accountService.fetchConfig());
      this.broadcastAccountStatus(`Synced settings for ${accountService.getStatus().email || "your account"}`);
    } catch (error) {
      logger.warn("Could not sync account settings", { error: error.message });
    }
  }

  /**
   * Dashboard settings are authoritative: a key the account no longer has is
   * cleared locally rather than left behind.
   */
  applyAccountPayload({ settings = {}, documents = [] } = {}) {
    if ("anthropicKey" in settings) {
      const key = typeof settings.anthropicKey === "string" ? settings.anthropicKey.trim() : "";
      llmService.updateApiKey(key || null);
      this.persistSettings({ anthropicKey: key });
    }

    llmService.setModel(typeof settings.model === "string" ? settings.model : null);
    llmService.setGroundingDocuments(documents);
  }

  broadcastAccountStatus(status, isError = false) {
    windowManager.broadcastToAllWindows("account-status", {
      status,
      isError,
      account: accountService.getStatus(),
      groundingDocuments: llmService.getGroundingDocumentNames(),
    });
  }

  setupServiceEventHandlers() {
    speechService.on("recording-started", () => {
      accountService.startSession(llmService.getModel());
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-started");
      });
    });

    speechService.on("recording-stopped", () => {
      accountService.endSession();
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-stopped");
      });
    });

    speechService.on("transcription", (text) => {
      // Session memory is written once the debounce window closes, so the
      // combined utterance is stored as a single turn rather than per chunk.
      const windows = BrowserWindow.getAllWindows();

      windows.forEach((window) => {
        window.webContents.send("transcription-received", { text });
      });

      accountService.recordUtterance();
      this.queueTranscriptForLLM(text);
    });

    speechService.on("interim-transcription", (text) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("interim-transcription", { text });
      });
    });

    speechService.on("status", (status) => {
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-status", { status, available: this.speechAvailable });
      });
      // Also broadcast availability specifically
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-availability", { available: this.speechAvailable });
      });
    });

    speechService.on("error", (error) => {
      // In error, still compute availability
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-error", { error, available: this.speechAvailable });
      });
    });
  }

  setupIPCHandlers() {
    ipcMain.handle("take-screenshot", () => this.triggerScreenshotOCR());
    ipcMain.handle("list-displays", () => captureService.listDisplays());
    ipcMain.handle("capture-area", (event, options) => captureService.captureAndProcess(options));

    // Provide reliable clipboard write via main process
    ipcMain.handle("copy-to-clipboard", (event, text) => {
      try {
        const { clipboard } = require("electron");
        clipboard.writeText(String(text ?? ""));
        return true;
      } catch (e) {
        logger.error("Failed to write to clipboard", { error: e.message });
        return false;
      }
    });

    ipcMain.handle("get-account-status", () => ({
      ...accountService.getStatus(),
      model: llmService.getModel(),
      groundingDocuments: llmService.getGroundingDocumentNames(),
    }));

    ipcMain.handle("sync-account-config", async () => {
      await this.syncAccountConfig();
      return accountService.getStatus();
    });

    ipcMain.handle("unlink-account", () => {
      accountService.unlink();
      llmService.setGroundingDocuments([]);
      llmService.setModel(null);
      llmService.updateApiKey(null);
      this.persistSettings({ anthropicKey: "" });
      this.broadcastAccountStatus("Unlinked from the dashboard account");
      return accountService.getStatus();
    });

    ipcMain.handle("get-speech-availability", () => {
      return speechService.isAvailable ? speechService.isAvailable() : false;
    });

    ipcMain.handle("start-speech-recognition", () => {
      speechService.startRecording();
      return speechService.getStatus();
    });

    ipcMain.handle("stop-speech-recognition", () => {
      speechService.stopRecording();
      return speechService.getStatus();
    });

    // Also handle direct send events for fallback
    ipcMain.on("start-speech-recognition", () => {
      speechService.startRecording();
    });

    ipcMain.on("stop-speech-recognition", () => {
      speechService.stopRecording();
    });

    ipcMain.on("chat-window-ready", () => {
      // Send a test message to confirm communication
      setTimeout(() => {
        windowManager.broadcastToAllWindows("transcription-received", {
          text: "Test message from main process - chat window communication is working!",
        });
      }, 1000);
    });

    ipcMain.on("test-chat-window", () => {
      windowManager.broadcastToAllWindows("transcription-received", {
        text: "🧪 IMMEDIATE TEST: Chat window IPC communication test successful!",
      });
    });

    ipcMain.handle("show-all-windows", () => {
      windowManager.showAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("hide-all-windows", () => {
      windowManager.hideAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("enable-window-interaction", () => {
      windowManager.setInteractive(true);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("disable-window-interaction", () => {
      windowManager.setInteractive(false);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-chat", () => {
      windowManager.switchToWindow("chat");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-skills", () => {
      windowManager.switchToWindow("skills");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("resize-window", (event, { width, height }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        // Enforce horizontal constraints: min ~one icon, max original width
        const minW = 60;
        const maxW = windowManager.windowConfigs?.main?.width || 520;
        const clampedWidth = Math.max(minW, Math.min(maxW, Math.round(width || minW)));
        try {
          // Match content size to the DOM so no extra transparent area remains
          mainWindow.setContentSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        } catch (e) {
          // Fallback in case setContentSize isn’t available on some platform
          mainWindow.setSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        }
        logger.debug("Main window resized (content)", { width: clampedWidth, height });
      }
      return { success: true };
    });

    ipcMain.handle("move-window", (event, { deltaX, deltaY }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        const [currentX, currentY] = mainWindow.getPosition();
        const newX = currentX + deltaX;
        const newY = currentY + deltaY;
        mainWindow.setPosition(newX, newY);
        logger.debug("Main window moved", {
          deltaX,
          deltaY,
          from: { x: currentX, y: currentY },
          to: { x: newX, y: newY },
        });
      }
      return { success: true };
    });

    ipcMain.handle("get-session-history", () => {
      return sessionManager.getOptimizedHistory();
    });

    ipcMain.handle("clear-session-memory", () => {
      this.discardPendingTranscript();
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      return { success: true };
    });

    ipcMain.handle("force-always-on-top", () => {
      windowManager.forceAlwaysOnTopForAllWindows();
      return { success: true };
    });

    ipcMain.handle("test-always-on-top", () => {
      const results = windowManager.testAlwaysOnTopForAllWindows();
      return { success: true, results };
    });

    ipcMain.handle("send-chat-message", async (event, text) => {
      // Add chat message to session memory
      sessionManager.addUserInput(text, 'chat');
      logger.debug('Chat message added to session memory', { textLength: text.length });

      // Typed messages are intentional, so they bypass the transcript debounce
      this.processTranscriptionWithLLM(text, sessionManager.getOptimizedHistory()).catch((error) => {
        logger.error("Failed to process chat message with LLM", {
          error: error.message,
          text: text.substring(0, 100)
        });
      });

      return { success: true };
    });

    ipcMain.handle("get-skill-prompt", (event, skillName) => {
      try {
        const { promptLoader } = require('./prompt-loader');
        const skillPrompt = promptLoader.getSkillPrompt(skillName);
        return skillPrompt;
      } catch (error) {
        logger.error('Failed to get skill prompt', { skillName, error: error.message });
        return null;
      }
    });

    ipcMain.handle("set-llm-api-key", (event, apiKey) => {
      const result = llmService.updateApiKey(apiKey);
      const stats = llmService.getStats();
      return Object.assign({ success: !!result.success }, stats, result.error ? { error: result.error } : {});
    });

    ipcMain.handle("get-llm-status", () => {
      return llmService.getStats();
    });

    // Window binding IPC handlers
    ipcMain.handle("set-window-binding", (event, enabled) => {
      return windowManager.setWindowBinding(enabled);
    });

    ipcMain.handle("toggle-window-binding", () => {
      return windowManager.toggleWindowBinding();
    });

    ipcMain.handle("get-window-binding-status", () => {
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("get-window-stats", () => {
      return windowManager.getWindowStats();
    });

    ipcMain.handle("set-window-gap", (event, gap) => {
      return windowManager.setWindowGap(gap);
    });

    ipcMain.handle("move-bound-windows", (event, { deltaX, deltaY }) => {
      windowManager.moveBoundWindows(deltaX, deltaY);
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("test-llm-connection", async () => {
      return await llmService.testConnection();
    });

    ipcMain.handle("run-llm-diagnostics", async () => {
      try {
        const apiTest = await llmService.testConnection();

        return {
          success: true,
          stats: llmService.getStats(),
          apiTest,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Settings handlers
    ipcMain.handle("show-settings", () => {
      windowManager.showSettings();

      // Send current settings to the settings window
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        const currentSettings = this.getSettings();
        setTimeout(() => {
          settingsWindow.webContents.send("load-settings", currentSettings);
        }, 100);
      }

      return { success: true };
    });

    ipcMain.handle("get-settings", () => {
      return this.getSettings();
    });

    ipcMain.handle("save-settings", (event, settings) => {
      return this.saveSettings(settings);
    });

    ipcMain.handle("update-app-icon", (event, iconKey) => {
      return this.updateAppIcon(iconKey);
    });

    ipcMain.handle("update-active-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-changed", { skill });
      return { success: true };
    });

    ipcMain.handle("restart-app-for-stealth", () => {
      // Force restart the app to ensure stealth name changes take effect
      const { app } = require("electron");
      app.relaunch();
      app.exit();
    });

    ipcMain.handle("close-window", (event) => {
      const webContents = event.sender;
      const window = windowManager.windows.forEach((win, type) => {
        if (win.webContents === webContents) {
          win.hide();
          return true;
        }
      });
      return { success: true };
    });

    // LLM window specific handlers
    ipcMain.handle("expand-llm-window", (event, contentMetrics) => {
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("resize-llm-window-for-content", (event, contentMetrics) => {
      // Use the same expansion logic for now, can be enhanced later
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("quit-app", () => {
      logger.info("Quit app requested via IPC");
      try {
        // Force quit the application
        const { app } = require("electron");

        // Close all windows first
        windowManager.destroyAllWindows();

        // Unregister shortcuts
        globalShortcut.unregisterAll();

        // Force quit
        app.quit();

        // If the above doesn't work, force exit
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      } catch (error) {
        logger.error("Error during quit:", error);
        process.exit(1);
      }
    });

    // Handle close settings
    ipcMain.on("close-settings", () => {
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        settingsWindow.hide();
      }
    });

    // Handle save settings (synchronous)
    ipcMain.on("save-settings", (event, settings) => {
      this.saveSettings(settings);
    });

    // Handle update skill
    ipcMain.on("update-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-updated", { skill });
    });

    // Handle quit app (alternative method)
    ipcMain.on("quit-app", () => {
      logger.info("Quit app requested via IPC (on method)");
      try {
        const { app } = require("electron");
        windowManager.destroyAllWindows();
        globalShortcut.unregisterAll();
        app.quit();
        setTimeout(() => process.exit(0), 1000);
      } catch (error) {
        logger.error("Error during quit (on method):", error);
        process.exit(1);
      }
    });
  }

  toggleSpeechRecognition() {
    const isAvailable = typeof speechService.isAvailable === 'function' ? speechService.isAvailable() : !!speechService.getStatus?.().isInitialized;
    if (!isAvailable) {
      logger.warn("Speech recognition unavailable; toggle ignored");
      try {
        windowManager.broadcastToAllWindows("speech-status", { status: 'Speech recognition unavailable', available: false });
        windowManager.broadcastToAllWindows("speech-availability", { available: false });
      } catch (e) { }
      return;
    }
    const currentStatus = speechService.getStatus();
    if (currentStatus.isRecording) {
      try {
        speechService.stopRecording();
        windowManager.hideChatWindow();
        logger.info("Speech recognition stopped via global shortcut");
      } catch (error) {
        logger.error("Error stopping speech recognition:", error);
      }
    } else {
      try {
        speechService.startRecording();
        windowManager.showChatWindow();
        logger.info("Speech recognition started via global shortcut");
      } catch (error) {
        logger.error("Error starting speech recognition:", error);
      }
    }
  }

  clearSessionMemory() {
    try {
      this.discardPendingTranscript();
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      logger.info("Session memory cleared via global shortcut");
    } catch (error) {
      logger.error("Error clearing session memory:", error);
    }
  }

  handleUpArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to previous skill
      this.navigateSkill(-1);
    } else {
      // Non-interactive mode: Move window up
      windowManager.moveBoundWindows(0, -20);
    }
  }

  handleDownArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to next skill
      this.navigateSkill(1);
    } else {
      // Non-interactive mode: Move window down
      windowManager.moveBoundWindows(0, 20);
    }
  }

  handleLeftArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window left
      windowManager.moveBoundWindows(-20, 0);
    }
    // Interactive mode: Left arrow does nothing
  }

  handleRightArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window right
      windowManager.moveBoundWindows(20, 0);
    }
    // Interactive mode: Right arrow does nothing
  }

  navigateSkill(direction) {
    const availableSkills = [
      "dsa",
    ];

    const currentIndex = availableSkills.indexOf(this.activeSkill);
    if (currentIndex === -1) {
      logger.warn("Current skill not found in available skills", {
        currentSkill: this.activeSkill,
        availableSkills,
      });
      return;
    }

    // Calculate new index with wrapping
    let newIndex = currentIndex + direction;
    if (newIndex >= availableSkills.length) {
      newIndex = 0; // Wrap to beginning
    } else if (newIndex < 0) {
      newIndex = availableSkills.length - 1; // Wrap to end
    }

    const newSkill = availableSkills[newIndex];
    this.activeSkill = newSkill;

    // Update session manager with the new skill
    sessionManager.setActiveSkill(newSkill);

    logger.info("Skill navigated via global shortcut", {
      from: availableSkills[currentIndex],
      to: newSkill,
      direction: direction > 0 ? "down" : "up",
    });

    // Broadcast the skill change to all windows
    windowManager.broadcastToAllWindows("skill-updated", { skill: newSkill });
  }

  needsProgrammingLanguage() {
    return ['dsa'].includes(this.activeSkill);
  }

  activeCodingLanguage() {
    return this.needsProgrammingLanguage() ? this.codingLanguage : null;
  }

  /**
   * Warm the skill prompt cache so the prompt disk read overlaps with capture.
   */
  async warmSkillPrompt() {
    try {
      const { promptLoader } = require('./prompt-loader');
      return promptLoader.getSkillPrompt(this.activeSkill, this.activeCodingLanguage());
    } catch (error) {
      logger.debug('Skill prompt warmup failed', { error: error.message });
      return null;
    }
  }

  /**
   * Build an onDelta handler that flips the overlay from loading to streaming
   * on the first token and appends afterwards.
   */
  createStreamHandler(metadata) {
    let started = false;
    return (delta, accumulated) => {
      if (!started) {
        started = true;
        windowManager.startLLMStream(metadata);
      }
      windowManager.streamLLMDelta(delta, accumulated);
    };
  }

  /**
   * Surface a failure in the overlay instead of leaving it spinning or hidden.
   */
  reportLLMFailure(error, context) {
    if (error && error.aborted) {
      logger.debug('Claude request superseded by a newer one', { context });
      return;
    }

    const message = error?.errorAnalysis?.userMessage || error?.message || 'Claude request failed.';

    logger.error('Claude request failed', {
      context,
      error: message,
      skill: this.activeSkill,
      stack: error?.originalError?.stack || error?.stack
    });

    windowManager.showLLMError(message, { skill: this.activeSkill, context });
    this.broadcastLLMError(message);

    sessionManager.addConversationEvent({
      role: 'system',
      content: `${context} failed: ${message}`,
      action: 'llm_error',
      metadata: { error: message, skill: this.activeSkill, context }
    });
  }

  async triggerScreenshotOCR() {
    if (!this.isReady) {
      logger.warn("Screenshot requested before application ready");
      return;
    }

    const startTime = Date.now();

    try {
      windowManager.showLLMLoading();

      // Capture the screen while the skill prompt loads in parallel.
      const [capture] = await Promise.all([
        captureService.captureAndProcess(),
        this.warmSkillPrompt()
      ]);

      if (!capture.imageBuffer || !capture.imageBuffer.length) {
        this.broadcastOCRError("Failed to capture screenshot image");
        windowManager.showLLMError("Could not capture the screen.", { skill: this.activeSkill });
        return;
      }

      const sessionHistory = sessionManager.getOptimizedHistory();
      const responseMetadata = { skill: this.activeSkill, isImageAnalysis: true };

      const llmResult = await llmService.processImageWithSkill(
        capture.imageBuffer,
        capture.mimeType || 'image/png',
        this.activeSkill,
        sessionHistory.recent,
        this.activeCodingLanguage(),
        { onDelta: this.createStreamHandler(responseMetadata) }
      );

      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        isImageAnalysis: true
      });

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        model: llmResult.metadata.model,
        isImageAnalysis: true
      });

      this.broadcastLLMSuccess(llmResult);

      logger.debug('Screenshot analysis completed', { duration: Date.now() - startTime });
    } catch (error) {
      this.reportLLMFailure(error, 'Screenshot analysis');
    }
  }

  async processWithLLM(text, sessionHistory) {
    try {
      sessionManager.addUserInput(text, 'llm_input');

      const responseMetadata = { skill: this.activeSkill };
      windowManager.showLLMLoading();

      const llmResult = await llmService.processTextWithSkill(
        text,
        this.activeSkill,
        sessionHistory.recent,
        this.activeCodingLanguage(),
        { onDelta: this.createStreamHandler(responseMetadata) }
      );

      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime
      });

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        model: llmResult.metadata.model
      });

      this.broadcastLLMSuccess(llmResult);
    } catch (error) {
      this.reportLLMFailure(error, 'Text analysis');
    }
  }

  /**
   * Collect transcript chunks and only reason over them once the speaker has
   * paused, so a burst of small chunks becomes a single Claude request.
   */
  queueTranscriptForLLM(text) {
    if (!text || typeof text !== 'string' || !text.trim()) return;

    this.pendingTranscript = this.pendingTranscript
      ? `${this.pendingTranscript} ${text.trim()}`
      : text.trim();

    if (this.transcriptDebounceTimer) clearTimeout(this.transcriptDebounceTimer);

    const debounceMs = config.get('llm.anthropic.transcriptDebounceMs') || 0;
    this.transcriptDebounceTimer = setTimeout(() => {
      const pending = this.pendingTranscript;
      this.pendingTranscript = null;
      this.transcriptDebounceTimer = null;

      this.processTranscriptionWithLLM(pending, sessionManager.getOptimizedHistory()).catch((error) => {
        logger.error("Failed to process transcript with Claude", { error: error.message });
      });
    }, debounceMs);
  }

  discardPendingTranscript() {
    if (this.transcriptDebounceTimer) {
      clearTimeout(this.transcriptDebounceTimer);
      this.transcriptDebounceTimer = null;
    }
    this.pendingTranscript = null;
    llmService.abortActiveRequest();
  }

  async processTranscriptionWithLLM(text, sessionHistory) {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (cleanText.length < 2) {
      logger.debug("Skipping Claude call for empty or very short transcript", { length: cleanText.length });
      return;
    }

    try {
      const responseMetadata = { skill: this.activeSkill, isTranscriptionResponse: true };
      windowManager.showLLMLoading();

      const llmResult = await llmService.processTranscriptionWithIntelligentResponse(
        cleanText,
        this.activeSkill,
        sessionHistory.recent,
        this.activeCodingLanguage(),
        { onDelta: this.createStreamHandler(responseMetadata) }
      );

      sessionManager.addUserInput(cleanText, 'speech');
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        isTranscriptionResponse: true
      });

      accountService.recordAnswer();
      this.broadcastTranscriptionLLMResponse(llmResult);

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        model: llmResult.metadata.model,
        isTranscriptionResponse: true
      });
    } catch (error) {
      sessionManager.addUserInput(cleanText, 'speech');
      this.reportLLMFailure(error, 'Live transcript response');
    }
  }

  broadcastOCRSuccess(ocrResult) {
    windowManager.broadcastToAllWindows("ocr-completed", {
      text: ocrResult.text,
      metadata: ocrResult.metadata,
    });
  }

  broadcastOCRError(errorMessage) {
    windowManager.broadcastToAllWindows("ocr-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLLMSuccess(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill, // Add the current active skill to the top level
    };

    logger.info("Broadcasting LLM success to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      dataKeys: Object.keys(broadcastData),
      responsePreview: llmResult.response.substring(0, 100) + "...",
    });

    windowManager.broadcastToAllWindows("llm-response", broadcastData);
  }

  broadcastLLMError(errorMessage) {
    windowManager.broadcastToAllWindows("llm-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastTranscriptionLLMResponse(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill,
      isTranscriptionResponse: true
    };

    logger.info("Broadcasting transcription LLM response to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      responsePreview: llmResult.response.substring(0, 100) + "..."
    });

    windowManager.broadcastToAllWindows("transcription-llm-response", broadcastData);
  }

  onWindowAllClosed() {
    if (process.platform !== "darwin") {
      app.quit();
    }
  }

  onActivate() {
    if (!this.isReady) {
      this.onAppReady();
    } else {
      // When app is activated, ensure windows appear on current desktop
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow && mainWindow.isVisible()) {
        windowManager.showOnCurrentDesktop(mainWindow);
      }

      // Also handle other visible windows
      windowManager.windows.forEach((window, type) => {
        if (window.isVisible()) {
          windowManager.showOnCurrentDesktop(window);
        }
      });

      logger.debug("App activated - ensured windows appear on current desktop");
    }
  }

  onWillQuit() {
    globalShortcut.unregisterAll();

    if (this.transcriptDebounceTimer) {
      clearTimeout(this.transcriptDebounceTimer);
      this.transcriptDebounceTimer = null;
    }
    llmService.abortActiveRequest();

    if (typeof speechService.dispose === 'function') {
      speechService.dispose();
    }

    windowManager.destroyAllWindows();

    const sessionStats = sessionManager.getMemoryUsage();
    logger.info("Application shutting down", {
      sessionEvents: sessionStats.eventCount,
      sessionSize: sessionStats.approximateSize,
    });
  }

  getSettings() {
    // Merge persisted settings (if any) with runtime defaults for the UI
    try {
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');

      const userDir = app.getPath('userData');
      const settingsPath = path.join(userDir, 'settings.json');

      let persisted = {};
      try {
        if (fs.existsSync(settingsPath)) {
          persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
        }
      } catch (e) {
        persisted = {};
      }

      return {
        // Speech fields show what the service will actually use, so .env values
        // are visible in the UI instead of empty placeholders.
        ...speechService.getStatus().effectiveSettings,
        codingLanguage: this.codingLanguage || persisted.codingLanguage || "cpp",
        activeSkill: this.activeSkill || persisted.activeSkill || "dsa",
        appIcon: this.appIcon || persisted.appIcon || "terminal",
        selectedIcon: this.appIcon || persisted.selectedIcon || "terminal",
        // pass through env-derived settings for UI convenience (masked)
        azureConfigured: !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
        speechAvailable: this.speechAvailable,
        // include persisted key if present (UI expects to populate field)
        anthropicKey: persisted.anthropicKey || null,
        account: accountService.getStatus(),
        llmStatus: llmService.getStats()
      };
    } catch (error) {
      return {
        codingLanguage: this.codingLanguage || "cpp",
        activeSkill: this.activeSkill || "dsa",
        appIcon: this.appIcon || "terminal",
        selectedIcon: this.appIcon || "terminal",
        azureConfigured: !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
        speechAvailable: this.speechAvailable,
        anthropicKey: null,
        llmStatus: llmService.getStats()
      };
    }
  }

  saveSettings(settings) {
    try {
      // Update application settings
      if (settings.codingLanguage) {
        this.codingLanguage = settings.codingLanguage;
        // Broadcast language change to all windows for sync
        windowManager.broadcastToAllWindows("coding-language-changed", {
          language: settings.codingLanguage,
        });
      }
      if (settings.activeSkill) {
        this.activeSkill = settings.activeSkill;
        // Broadcast skill change to all windows
        windowManager.broadcastToAllWindows("skill-updated", {
          skill: settings.activeSkill,
        });
      }
      if (settings.appIcon) {
        this.appIcon = settings.appIcon;
      }

      // Handle icon change specifically
      if (settings.selectedIcon) {
        this.appIcon = settings.selectedIcon;
        // Immediately update the app icon
        this.updateAppIcon(settings.selectedIcon);
      }

      // Persist settings to file or config
      this.persistSettings(settings);

      this.applySpeechSettings(settings);

      // Apply an Anthropic key supplied via the settings UI immediately; an
      // explicitly emptied field clears the override and falls back to .env.
      if (typeof settings.anthropicKey === 'string') {
        try {
          llmService.updateApiKey(settings.anthropicKey || null);
        } catch (e) {
          logger.error('Failed to apply Anthropic API key from settings', { error: e.message });
        }
      }

      const loggableSettings = Object.assign({}, settings);
      if (loggableSettings.anthropicKey) loggableSettings.anthropicKey = '***REDACTED***';
      logger.info("Settings saved successfully", loggableSettings);
      return { success: true };
    } catch (error) {
      logger.error("Failed to save settings", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  applySpeechSettings(settings) {
    try {
      const status = speechService.updateSettings(settings);
      this.speechAvailable = speechService.isAvailable();
      windowManager.broadcastToAllWindows("speech-status", {
        status: `Speech provider: ${status.provider}`,
        available: this.speechAvailable
      });
    } catch (error) {
      logger.error("Failed to apply speech settings", { error: error.message });
    }
  }

  persistSettings(settings) {
    try {
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');

      const userDir = app.getPath('userData');
      const settingsPath = path.join(userDir, 'settings.json');

      // Read existing settings, merge, and write atomically
      let existing = {};
      try {
        if (fs.existsSync(settingsPath)) {
          const raw = fs.readFileSync(settingsPath, 'utf8');
          existing = JSON.parse(raw || '{}');
        }
      } catch (e) {
        // ignore parse errors and overwrite
        existing = {};
      }

      const merged = Object.assign({}, existing, settings);
      if (settings.anthropicKey === '') delete merged.anthropicKey;

      // Ensure directory exists
      try {
        fs.mkdirSync(userDir, { recursive: true });
      } catch (e) { }

      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), { mode: 0o600 });

      // Do not log sensitive values like API keys
      const safeLog = Object.assign({}, settings);
      if (safeLog.anthropicKey) safeLog.anthropicKey = '***REDACTED***';
      logger.debug('Settings persisted to disk', { path: settingsPath, settings: safeLog });
    } catch (error) {
      logger.error('Failed to persist settings', { error: error.message });
    }
  }

  loadPersistedSettings() {
    try {
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');

      const userDir = app.getPath('userData');
      const settingsPath = path.join(userDir, 'settings.json');

      if (!fs.existsSync(settingsPath)) return null;

      const raw = fs.readFileSync(settingsPath, 'utf8');
      const persisted = JSON.parse(raw || '{}');

      // Apply persisted values into controller state where applicable
      if (persisted.codingLanguage) this.codingLanguage = persisted.codingLanguage;
      if (persisted.activeSkill) this.activeSkill = persisted.activeSkill;
      if (persisted.appIcon) this.appIcon = persisted.appIcon;

      speechService.updateSettings(persisted);

      // An env-provided key always wins over a stored one
      if (persisted.anthropicKey && !config.getApiKey('ANTHROPIC')) {
        try {
          llmService.updateApiKey(persisted.anthropicKey);
        } catch (e) {
          logger.error('Failed to apply persisted Anthropic key at startup', { error: e.message });
        }
      }

      logger.info('Persisted settings loaded', { path: settingsPath, keys: Object.keys(persisted) });
      return persisted;
    } catch (error) {
      logger.error('Failed to load persisted settings', { error: error.message });
      return null;
    }
  }

  updateAppIcon(iconKey) {
    try {
      const { app } = require("electron");
      const path = require("path");
      const fs = require("fs");

      // Icon mapping for available icons in assests/icons folder
      const iconPaths = {
        terminal: "assests/icons/terminal.png",
        activity: "assests/icons/activity.png",
        settings: "assests/icons/settings.png",
      };

      // App name mapping for stealth mode
      const appNames = {
        terminal: "Terminal ",
        activity: "Activity Monitor ",
        settings: "System Settings ",
      };

      const iconPath = iconPaths[iconKey];
      const appName = appNames[iconKey];

      if (!iconPath) {
        logger.error("Invalid icon key", { iconKey });
        return { success: false, error: "Invalid icon key" };
      }

      const fullIconPath = path.resolve(iconPath);

      if (!fs.existsSync(fullIconPath)) {
        logger.error("Icon file not found", {
          iconKey,
          iconPath: fullIconPath,
        });
        return { success: false, error: "Icon file not found" };
      }

      // Set app icon for dock/taskbar
      if (process.platform === "darwin") {
        // macOS - update dock icon
        app.dock.setIcon(fullIconPath);

        // Force dock refresh with multiple attempts
        setTimeout(() => {
          app.dock.setIcon(fullIconPath);
        }, 100);

        setTimeout(() => {
          app.dock.setIcon(fullIconPath);
        }, 500);
      } else {
        // Windows/Linux - update window icons
        windowManager.windows.forEach((window, type) => {
          if (window && !window.isDestroyed()) {
            window.setIcon(fullIconPath);
          }
        });
      }

      // Update app name for stealth mode
      this.updateAppName(appName, iconKey);

      logger.info("App icon and name updated successfully", {
        iconKey,
        appName,
        iconPath: fullIconPath,
        platform: process.platform,
        fileExists: fs.existsSync(fullIconPath),
      });

      this.appIcon = iconKey;
      return { success: true };
    } catch (error) {
      logger.error("Failed to update app icon", {
        error: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  updateAppName(appName, iconKey) {
    try {
      const { app } = require("electron");

      // Force update process title for Activity Monitor stealth - CRITICAL
      process.title = appName;

      // Set app name in dock (macOS) - this affects the dock and Activity Monitor
      if (process.platform === "darwin") {
        // Multiple attempts to ensure the name sticks
        app.setName(appName);

        // Force update the bundle name for macOS stealth
        const { execSync } = require("child_process");
        try {
          // Update the app's Info.plist CFBundleName in memory
          if (process.mainModule && process.mainModule.filename) {
            const appPath = process.mainModule.filename;
            // Force set the bundle name directly
            process.env.CFBundleName = appName.trim();
          }
        } catch (e) {
          // Silently fail if we can't modify bundle info
        }

        // Clear dock badge and reset
        if (app.dock) {
          app.dock.setBadge("");
          // Force dock refresh
          setTimeout(() => {
            app.dock.setIcon(
              require("path").resolve(`assests/icons/${iconKey}.png`)
            );
          }, 50);
        }
      }

      // Set app user model ID for Windows taskbar grouping
      app.setAppUserModelId(`${appName.trim()}-${iconKey}`);

      // Update all window titles to match the new app name
      const windows = windowManager.windows;
      windows.forEach((window, type) => {
        if (window && !window.isDestroyed()) {
          // Use stealth name for all windows
          const stealthTitle = appName.trim();
          window.setTitle(stealthTitle);
        }
      });

      // Multiple force refreshes with increasing delays
      const refreshTimes = [50, 100, 200, 500];
      refreshTimes.forEach((delay) => {
        setTimeout(() => {
          process.title = appName;
          if (process.platform === "darwin") {
            app.setName(appName);
            // Force update bundle display name
            if (app.getName() !== appName) {
              app.setName(appName);
            }
          }
        }, delay);
      });

      logger.info("App name updated for stealth mode", {
        appName,
        processTitle: process.title,
        appGetName: app.getName(),
        iconKey,
        platform: process.platform,
      });
    } catch (error) {
      logger.error("Failed to update app name", { error: error.message });
    }
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  const controller = new ApplicationController();
  app.on("second-instance", (event, argv) => controller.handleSecondInstance(argv));
}
