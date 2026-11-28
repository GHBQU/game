(function () {
  'use strict';
  var status = document.getElementById('copy-status');
  var timer;
  function notify(message) {
    status.textContent = message;
    status.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(function () { status.classList.remove('visible'); }, 2400);
  }
  function fallbackCopy(text) {
    var input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    var focused = document.activeElement;
    input.select();
    var ok = document.execCommand('copy');
    input.remove();
    if (focused && focused.focus) focused.focus();
    if (!ok) throw new Error('copy failed');
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    button.addEventListener('click', function () {
      var target = document.getElementById(button.getAttribute('data-copy'));
      if (!target) return;
      var text = target.textContent.trim();
      var operation = navigator.clipboard && window.isSecureContext
        ? navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); })
        : Promise.resolve().then(function () { fallbackCopy(text); });
      operation.then(function () { notify('已复制到剪贴板'); }).catch(function () { notify('复制未完成，请选中文字手动复制'); });
    });
  });
}());
