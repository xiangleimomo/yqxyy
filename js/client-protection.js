/*
 * Basic client-side deterrents only. These controls cannot protect code that
 * is delivered to the browser, and are not a substitute for server-side access
 * control or a private source repository.
 */
(() => {
  document.addEventListener('contextmenu', event => {if(!window.SFCloud?.isAdmin?.())event.preventDefault();});
  document.addEventListener('keydown', event => {
    if(window.SFCloud?.isAdmin?.())return;
    const key = event.key.toLowerCase();
    const devToolsShortcut = event.key === 'F12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.ctrlKey && key === 'u');
    if (devToolsShortcut) event.preventDefault();
  });
})();
