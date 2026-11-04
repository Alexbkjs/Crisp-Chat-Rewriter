// Keyboard shortcut format shared by the content script and the options page, e.g. "Alt+Shift+A".
// Based on e.code so a shortcut keeps working on other keyboard layouts.

function shortcutFromEvent(e) {
  if (!e.code || /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(e.code)) return null;

  const key = e.code.replace(/^Key/, '').replace(/^Digit/, '');
  return [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Meta',
    key
  ].filter(Boolean).join('+');
}
