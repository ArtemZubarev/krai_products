/**
 * Tilda Store: в попапе товара показывает в левой колонке только 7 фото выбранного цвета.
 * Условия: 35 слайдов подряд (5 цветов × 7), data-zoom-target 1–35, опция name="Цвет".
 *
 * Прямой заход по URL: магазин Тильды часто дорисовывает попап и выбранный цвет после
 * DOMContentLoaded. Хуки вешаются один раз; повторная синхронизация — через load и таймеры.
 *
 * Использование на Тильде: скопируйте код внутрь <script>…</script> в HTML-блоке (T123)
 * на странице с каталогом, либо подключите файл с CDN/хостинга как обычный script src.
 */
(function () {
  "use strict";

  var EXPECTED_SLIDES = 35;
  var SELECTOR_GALLERY = ".js-store-desktop-custom-gallery";
  var SELECTOR_SLIDE = ".t-store__prod-popup__wrapper__col1_fixed";
  var IMG_SELECTOR = "img[data-zoom-target]";
  var COLOR_INPUT_NAME = "Цвет";

  /** value радиокнопки → [min, max] для data-zoom-target */
  var COLOR_RANGES = {
    Черный: [1, 7],
    Бежевый: [8, 14],
    Голубой: [15, 21],
    Серый: [22, 28],
    Терракотовый: [29, 35],
    // старые карточки, если опция ещё не переименована в каталоге
    Коричневый: [22, 28],
  };

  var hooksInstalled = false;
  var lateResyncTimersScheduled = false;

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function findPopupRootFromGallery(gallery) {
    var el = gallery.parentElement;
    while (el && el !== document.documentElement) {
      if (
        el.querySelector &&
        el.querySelector('input[name="' + COLOR_INPUT_NAME + '"]')
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function findPopupRootFromInput(input) {
    var el = input.parentElement;
    while (el && el !== document.documentElement) {
      if (el.querySelector && el.querySelector(SELECTOR_GALLERY)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function applyToGallery(gallery, colorValue) {
    if (!gallery || !colorValue) return;

    var range = COLOR_RANGES[colorValue];
    if (!range) return;

    var wrappers = gallery.querySelectorAll(SELECTOR_SLIDE);
    if (wrappers.length !== EXPECTED_SLIDES) return;

    var minZ = range[0];
    var maxZ = range[1];
    var firstVisibleImg = null;

    for (var i = 0; i < wrappers.length; i++) {
      var wrap = wrappers[i];
      var img = wrap.querySelector(IMG_SELECTOR);
      if (!img) continue;

      img.classList.remove("js-product-img");

      var z = parseInt(img.getAttribute("data-zoom-target"), 10);
      if (isNaN(z)) continue;

      var show = z >= minZ && z <= maxZ;
      if (show) {
        wrap.style.removeProperty("display");
        if (!firstVisibleImg) firstVisibleImg = img;
      } else {
        wrap.style.setProperty("display", "none", "important");
      }
    }

    if (firstVisibleImg) {
      firstVisibleImg.classList.add("js-product-img");
    }
  }

  function syncFromColorInput(input) {
    if (!input || input.name !== COLOR_INPUT_NAME) return;
    var root = findPopupRootFromInput(input);
    if (!root) return;
    var gallery = root.querySelector(SELECTOR_GALLERY);
    if (!gallery) return;
    var checked = root.querySelector(
      'input[name="' + COLOR_INPUT_NAME + '"]:checked',
    );
    applyToGallery(gallery, checked ? checked.value : null);
  }

  function collectGalleriesFromNode(node) {
    var list = [];
    if (!node || node.nodeType !== 1) return list;
    if (node.matches && node.matches(SELECTOR_GALLERY)) {
      list.push(node);
    }
    if (node.querySelectorAll) {
      var found = node.querySelectorAll(SELECTOR_GALLERY);
      for (var i = 0; i < found.length; i++) list.push(found[i]);
    }
    return list;
  }

  /** Синхронизация всех галерей на странице (включая уже вставленный попап по ссылке). */
  function syncInjectedGalleries(node) {
    var galleries = collectGalleriesFromNode(node);
    if (!galleries.length && node === document.body) {
      var all = document.querySelectorAll(SELECTOR_GALLERY);
      for (var g = 0; g < all.length; g++) galleries.push(all[g]);
    }
    for (var i = 0; i < galleries.length; i++) {
      var root = findPopupRootFromGallery(galleries[i]);
      if (!root) continue;
      var checked = root.querySelector(
        'input[name="' + COLOR_INPUT_NAME + '"]:checked',
      );
      applyToGallery(galleries[i], checked ? checked.value : null);
    }
  }

  var onMutations = debounce(function () {
    syncInjectedGalleries(document.body);
  }, 50);

  function resyncAll() {
    syncInjectedGalleries(document.body);
  }

  /**
   * Отложенные прогоны только для кейса «открыли товар по URL»: DOM уже есть,
   * но выбранный цвет/попап дорисовались позже наших первых вызовов.
   */
  function scheduleLateResyncTimersOnce() {
    if (lateResyncTimersScheduled) return;
    lateResyncTimersScheduled = true;
    var delays = [0, 120, 350, 800, 1600, 3200];
    for (var b = 0; b < delays.length; b++) {
      (function (ms) {
        setTimeout(resyncAll, ms);
      })(delays[b]);
    }
  }

  function installHooksOnce() {
    if (hooksInstalled) return;
    hooksInstalled = true;

    document.addEventListener(
      "change",
      function (e) {
        var t = e.target;
        if (
          t &&
          t.matches &&
          t.matches('input[name="' + COLOR_INPUT_NAME + '"]')
        ) {
          syncFromColorInput(t);
        }
      },
      true,
    );

    var onHistory = debounce(resyncAll, 50);
    window.addEventListener("hashchange", onHistory);
    window.addEventListener("popstate", onHistory);

    if (document.body) {
      var mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
            onMutations();
            return;
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState !== "complete") {
      window.addEventListener("load", function () {
        resyncAll();
      });
    }
  }

  /** Полная «инициализация»: один раз хуки, сразу sync + отложенные прогоны. */
  function boot() {
    if (!document.body) return;
    installHooksOnce();
    resyncAll();
    scheduleLateResyncTimersOnce();
  }

  function onDomReady() {
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }

  if (document.readyState === "complete") {
    resyncAll();
  }
})();
