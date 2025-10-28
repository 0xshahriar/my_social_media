const ThemeMode = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
});

const THEME_KEY = "social0x1-theme";
const themeButtons = document.querySelectorAll("[data-theme-mode]");
const root = document.documentElement;
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
  root.setAttribute("data-theme", mode);
}

function applySystemPreference() {
  if (!systemMedia) {
    systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
    systemMedia.addEventListener("change", () => {
      if (currentMode === ThemeMode.SYSTEM) {
        applySystemPreference();
      }
    });
  }
  const prefersDark = systemMedia.matches;
  setThemeAttribute(prefersDark ? ThemeMode.DARK : ThemeMode.LIGHT);
}

function applyTheme(mode) {
  currentMode = mode;
  if (mode === ThemeMode.SYSTEM) {
    applySystemPreference();
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
  systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
  systemMedia.addEventListener("change", () => {
    if (currentMode === ThemeMode.SYSTEM) {
      applySystemPreference();
    }
  });

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
