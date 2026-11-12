// Переключатель дневной / ночной карты.
(function () {
  'use strict';

  var App = window.App;
  var KEY = 'mapTheme';
  var IMAGES = { day: 'img/map-day.jpg', night: 'img/map-night.jpg' };
  var button = document.getElementById('theme-toggle');

  function readSaved() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === 'night' ? 'night' : 'day';
    } catch (e) {
      return 'day';
    }
  }

  function save(theme) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch (e) {
      /* хранилище недоступно — просто не запоминаем */
    }
  }

  App.setTheme = function (theme) {
    theme = theme === 'night' ? 'night' : 'day';
    App.theme = theme;
    document.body.classList.toggle('theme-night', theme === 'night');
    if (App.mapImage !== IMAGES[theme]) {
      App.mapImage = IMAGES[theme];
      App.mapLayer.setUrl(IMAGES[theme]);
    }
    // значок показывает режим, на который переключит кнопка
    var night = theme === 'night';
    button.textContent = night ? '☀️' : '🌙';
    button.setAttribute('aria-label', night ? 'Включить дневную карту' : 'Включить ночную карту');
    button.title = button.getAttribute('aria-label');
    save(theme);
  };

  button.addEventListener('click', function () {
    App.setTheme(App.theme === 'night' ? 'day' : 'night');
  });

  App.setTheme(readSaved());
})();
