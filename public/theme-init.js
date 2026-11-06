// Applies the saved night/day theme before first paint (see src/theme/theme.js). A separate file, not an
// inline <script>, because the server's Content-Security-Policy is "script-src 'self'".
try {
  if (localStorage.getItem("dfl-theme") === "light") {
    document.documentElement.dataset.theme = "light";
    document.querySelector('meta[name="theme-color"]').setAttribute("content", "#fafafa");
  }
} catch {
  // Storage blocked: keep the default night theme.
}
