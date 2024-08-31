import { Window, windowManager } from "node-window-manager";
import EventEmitter from "node:events";
import { exiftool, Tags } from "exiftool-vendored";
import path from "node:path";
import { LinuxResult, openWindowsSync, activeWindowSync } from "get-windows";

type LinuxResultExtra = LinuxResult & {
  getExif(): Promise<Tags> | undefined;
  lastFocusAt?: number;
  createdAt?: number;
};

declare module "node-window-manager" {
  interface Window {
    getExif(): Promise<Tags> | undefined;
    lastFocusAt?: number;
    createdAt?: number;
  }
}
declare module "exiftool-vendored" {
  interface Tags {
    FileDescription: String | undefined;
  }
}

Window.prototype.getExif = function () {
  return exiftool.read(this.path);
};

interface WindowDetails {
  createdAt: number;
  lastFocusAt: number;
  path: string;
}

interface Events {
  change: (window?: Window) => void;
}

interface LinuxEvents {
  change: (window?: LinuxResultExtra) => void;
}

export class ProcessListener extends EventEmitter {
  executableFilenames: Set<string>;
  windowDetails = new Map<string, WindowDetails>();
  lastActiveWindowCache: Window | undefined;

  public on<K extends keyof Events>(e: K, listener: Events[K]): this {
    return super.on(e, listener);
  }
  public emit<K extends keyof Events>(
    event: K,
    ...args: Parameters<Events[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  constructor(executableFilenames: string[]) {
    super();
    this.executableFilenames = new Set(executableFilenames);
    setTimeout(() => {
      this.loop();
    });
    setInterval(this.loop.bind(this), 5000);
  }
  addExecutable(filename: string) {
    this.executableFilenames.add(filename);
    this.loop();
  }
  removeExecutable(filename: string) {
    this.executableFilenames.delete(filename);
    this.loop();
  }
  updateExecutableFilenames(executableFilenames: string[]) {
    this.executableFilenames = new Set(executableFilenames);
    this.loop();
  }
  lastActiveWindow() {
    const windows = windowManager.getWindows();
    return [...this.windowDetails.values()]
      .filter((details) => {
        const filename = path.basename(details.path);
        return this.executableFilenames.has(filename);
      })
      .sort((a, b) => {
        return b.lastFocusAt - a.lastFocusAt;
      })
      .map((details) => {
        const window = windows.find((w) => w.path === details.path)!;
        if (!window) return undefined;
        window.createdAt = details.createdAt;
        window.lastFocusAt = details.lastFocusAt;
        return window;
      })[0] as Window | undefined;
  }
  loop() {
    const activeWindow = windowManager.getActiveWindow();
    const windows = windowManager.getWindows();

    // add new details
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      this.updateWindowDetails(window);
    }

    // remove closed window details
    this.windowDetails.forEach((details, path) => {
      if (!windows.find((w) => w.path === path)) {
        this.windowDetails.delete(path);
      }
    });
    if (this.lastActiveWindow()?.path !== activeWindow?.path) {
      this.updateWindowDetails(activeWindow, true);
    }

    const newLastActiveWindow = this.lastActiveWindow();

    if (newLastActiveWindow?.path !== this.lastActiveWindowCache?.path) {
      this.lastActiveWindowCache = newLastActiveWindow;
      this.emit("change", newLastActiveWindow);
    }
  }
  private updateWindowDetails(window: Window, forceUpdateFocusAt?: boolean) {
    const obj = {
      ...(this.windowDetails.get(window.path) || {
        path: window.path,
        createdAt: Date.now(),
      }),
    } as WindowDetails;
    (forceUpdateFocusAt || !obj.lastFocusAt) && (obj.lastFocusAt = Date.now());
    this.windowDetails.set(window.path, obj);
  }
}

export class ProcessListenerLinux extends EventEmitter {
  executableFilenames: Set<string>;
  windowDetails = new Map<string, WindowDetails>();
  lastActiveWindowCache: LinuxResultExtra | undefined;

  public on<K extends keyof LinuxEvents>(e: K, listener: LinuxEvents[K]): this {
    return super.on(e, listener);
  }
  public emit<K extends keyof LinuxEvents>(
    event: K,
    ...args: Parameters<LinuxEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  constructor(executableFilenames: string[]) {
    super();
    this.executableFilenames = new Set(executableFilenames);
    setTimeout(() => {
      this.loop();
    });
    setInterval(this.loop.bind(this), 5000);
  }
  addExecutable(filename: string) {
    this.executableFilenames.add(filename);
    this.loop();
  }
  removeExecutable(filename: string) {
    this.executableFilenames.delete(filename);
    this.loop();
  }
  updateExecutableFilenames(executableFilenames: string[]) {
    this.executableFilenames = new Set(executableFilenames);
    this.loop();
  }
  lastActiveWindow() {
    const windows = openWindowsSync();
    if (!windows) return undefined;
    return [...this.windowDetails.values()]
      .filter((details) => {
        const filename = path.basename(details.path);
        return this.executableFilenames.has(filename);
      })
      .sort((a, b) => {
        return b.lastFocusAt - a.lastFocusAt;
      })
      .map((details) => {
        const window = windows.find(
          (w) => w.owner.path === details.path
        )! as LinuxResultExtra;
        if (!window) return undefined;
        window.createdAt = details.createdAt;
        window.lastFocusAt = details.lastFocusAt;
        return window;
      })[0] as LinuxResultExtra | undefined;
  }
  loop() {
    const activeWindow = activeWindowSync() as LinuxResultExtra;
    const windows = openWindowsSync() as LinuxResultExtra[];
    if (!windows) return;

    // add new details
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i] as LinuxResultExtra;
      this.updateWindowDetails(window);
    }

    // remove closed window details
    this.windowDetails.forEach((details, path) => {
      if (!windows.find((w) => w.owner.path === path)) {
        this.windowDetails.delete(path);
      }
    });
    if (this.lastActiveWindow()?.owner.path !== activeWindow?.owner.path) {
      this.updateWindowDetails(activeWindow, true);
    }

    const newLastActiveWindow = this.lastActiveWindow();

    if (
      newLastActiveWindow?.owner.path !== this.lastActiveWindowCache?.owner.path
    ) {
      this.lastActiveWindowCache = newLastActiveWindow;
      this.emit("change", newLastActiveWindow);
    }
  }
  private updateWindowDetails(
    window: LinuxResultExtra,
    forceUpdateFocusAt?: boolean
  ) {
    const obj = {
      ...(this.windowDetails.get(window.owner.path) || {
        path: window.owner.path,
        createdAt: Date.now(),
      }),
    } as WindowDetails;
    (forceUpdateFocusAt || !obj.lastFocusAt) && (obj.lastFocusAt = Date.now());
    this.windowDetails.set(window.owner.path, obj);
  }
}

export function getWindows() {
  const filteredFolder = ["Windows"];

  const arr: Window[] = [];

  const windowArr = windowManager.getWindows();
  for (let index = 0; index < windowArr.length; index++) {
    const window = windowArr[index];
    if (arr.findIndex((w) => w.path === window.path) + 1) continue;
    const path = window.path.substring(3);
    if (filteredFolder.find((f) => path.startsWith(f))) continue;
    if (!window.getTitle()?.trim()) continue;
    if (!window.isWindow()) continue;
    arr.push(window);
  }
  return arr;
}

export function getLinuxWindows() {
  const windows = openWindowsSync();
  if (!windows) return [];
  return windows;
}
