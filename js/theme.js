const ThemeMode = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
});

const THEME_KEY = "social0x1-theme";
const root = document.documentElement;
let themeButtons = [];
let currentMode = ThemeMode.SYSTEM;
let systemMedia;

function getStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch (error) {
    console.warn("Unable to access localStorage", error);
    return null;
  }
}

function storeTheme(mode) {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch (error) {
    console.warn("Unable to persist theme preference", error);
  }
}

function reflectActiveButton(mode) {
  themeButtons.forEach((btn) => {
    const isActive = btn.dataset.themeMode === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setThemeAttribute(mode) {
  const normalizedMode = mode === ThemeMode.DARK ? ThemeMode.DARK : ThemeMode.LIGHT;
  root?.setAttribute("data-theme", normalizedMode);
  if (document.body) {
    document.body.setAttribute("data-theme", normalizedMode);
    document.body.style.colorScheme = normalizedMode;
  }
  if (root) {
    root.style.colorScheme = normalizedMode;
  }
}

function resolveSystemMode(media = systemMedia) {
  const prefersDark = !!media?.matches;
  setThemeAttribute(prefersDark ? ThemeMode.DARK : ThemeMode.LIGHT);
}

function handleSystemChange(event) {
  if (currentMode !== ThemeMode.SYSTEM) {
    return;
  }
  resolveSystemMode(event);
}

function applyTheme(mode) {
  currentMode = mode;
  if (mode === ThemeMode.SYSTEM) {
    if (systemMedia) {
      resolveSystemMode();
    } else {
      setThemeAttribute(ThemeMode.LIGHT);
    }
  } else {
    setThemeAttribute(mode);
  }
  reflectActiveButton(mode);
  storeTheme(mode);
}

function resolvePreferredTheme() {
  const storedValue = getStoredTheme();
  if (storedValue && Object.values(ThemeMode).includes(storedValue)) {
    return storedValue;
  }
  return ThemeMode.SYSTEM;
}

export function initializeTheme() {
  themeButtons = Array.from(document.querySelectorAll("[data-theme-mode]"));
  systemMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  if (systemMedia) {
    if (typeof systemMedia.addEventListener === "function") {
      systemMedia.addEventListener("change", handleSystemChange);
    } else if (typeof systemMedia.addListener === "function") {
      systemMedia.addListener(handleSystemChange);
    }
  }

  applyTheme(resolvePreferredTheme());

  themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.themeMode;
      if (!Object.values(ThemeMode).includes(mode)) {
        return;
      }
      applyTheme(mode);
    });
  });
}
