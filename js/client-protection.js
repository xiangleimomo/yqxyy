/*
 * Basic client-side deterrents only. These controls cannot protect code that
 * is delivered to the browser, and are not a substitute for server-side access
 * control or a private source repository.
 */
(() => {
  const threshold = 170;
  let warning;

  function showWarning() {
    if(window.SFCloud?.isAdmin?.())return;
    if (warning) return;
    warning = document.createElement('div');
    warning.className = 'client-protection-warning';
    warning.setAttribute('role', 'alert');
    warning.innerHTML = '<div><span aria-hidden="true">🔒</span><strong>已检测到开发者工具</strong><p>为保护学习内容，本页面已暂停显示。</p></div>';
    document.body.appendChild(warning);
  }

  function checkDevTools() {
    if(window.SFCloud?.isAdmin?.()){warning?.remove();warning=null;return;}
    const widthOpen = window.outerWidth - window.innerWidth > threshold;
    const heightOpen = window.outerHeight - window.innerHeight > threshold;
    if (widthOpen || heightOpen) showWarning();
  }

  document.addEventListener('contextmenu', event => {if(!window.SFCloud?.isAdmin?.())event.preventDefault();});
  document.addEventListener('keydown', event => {
    if(window.SFCloud?.isAdmin?.())return;
    const key = event.key.toLowerCase();
    const devToolsShortcut = event.key === 'F12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.ctrlKey && key === 'u');
    if (devToolsShortcut) event.preventDefault();
  });

  window.addEventListener('resize', checkDevTools);
  document.addEventListener('sf-access-change',checkDevTools);
  window.setInterval(checkDevTools, 1200);
})();
