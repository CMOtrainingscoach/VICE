import Script from "next/script";

const themeInit = `
(function () {
  try {
    var pref = localStorage.getItem('vice-theme');
    var theme = pref === 'light' || pref === 'dark' ? pref : null;
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export function ThemeScript() {
  return (
    <Script id="vice-theme-init" strategy="beforeInteractive">
      {themeInit}
    </Script>
  );
}
