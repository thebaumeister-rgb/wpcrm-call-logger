(() => {
  const setup = document.querySelector('#setup-view');
  const call = document.querySelector('#call-view');
  let scrollPosition = 0;
  document.querySelector('#open-setup').addEventListener('click', event => {
    event.preventDefault();
    stopFieldDictation();
    scrollPosition = window.scrollY;
    call.hidden = true; setup.hidden = false;
    document.querySelector('#reset-form').hidden = true;
    document.querySelector('#setup-heading').focus(); window.scrollTo(0, 0);
  });
  document.querySelector('#close-setup').addEventListener('click', () => {
    setup.hidden = true; call.hidden = false;
    document.querySelector('#reset-form').hidden = false;
    document.querySelector('#open-setup').focus({ preventScroll: true }); window.scrollTo(0, scrollPosition);
  });
})();
