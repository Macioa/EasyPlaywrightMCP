(function () {
  function showToast(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(function () {
      el.classList.remove("show");
    }, 2500);
  }

  // Home
  var refresh = document.getElementById("btn-refresh");
  var increment = document.getElementById("btn-increment");
  var reset = document.getElementById("btn-reset");
  var tasks = document.getElementById("stat-tasks");
  var sessions = document.getElementById("stat-sessions");
  var homeToast = document.getElementById("home-toast");

  if (refresh && tasks && sessions) {
    refresh.addEventListener("click", function () {
      sessions.textContent = String(10 + Math.floor(Math.random() * 10));
      showToast(homeToast, "Stats refreshed");
    });
    increment.addEventListener("click", function () {
      tasks.textContent = String(Number(tasks.textContent) + 1);
      showToast(homeToast, "Tasks incremented");
    });
    reset.addEventListener("click", function () {
      sessions.textContent = "12";
      tasks.textContent = "4";
      showToast(homeToast, "Stats reset");
    });
  }

  // Widgets — counter
  var counterValue = document.getElementById("counter-value");
  var btnInc = document.getElementById("btn-inc");
  var btnDec = document.getElementById("btn-dec");
  var btnCounterReset = document.getElementById("btn-counter-reset");
  if (counterValue && btnInc && btnDec && btnCounterReset) {
    btnInc.addEventListener("click", function () {
      counterValue.textContent = String(Number(counterValue.textContent) + 1);
    });
    btnDec.addEventListener("click", function () {
      counterValue.textContent = String(Number(counterValue.textContent) - 1);
    });
    btnCounterReset.addEventListener("click", function () {
      counterValue.textContent = "0";
    });
  }

  // Widgets — slider
  var volume = document.getElementById("volume");
  var volumeLabel = document.getElementById("volume-label");
  var volumeBar = document.getElementById("volume-bar");
  if (volume && volumeLabel && volumeBar) {
    volume.addEventListener("input", function () {
      volumeLabel.textContent = volume.value + "%";
      volumeBar.style.width = volume.value + "%";
    });
  }

  // Widgets — toggle
  var featureToggle = document.getElementById("feature-toggle");
  var toggleLabel = document.getElementById("toggle-label");
  if (featureToggle && toggleLabel) {
    featureToggle.addEventListener("change", function () {
      toggleLabel.textContent = featureToggle.checked ? "Feature on" : "Feature off";
    });
  }

  // Widgets — tabs
  var tabs = document.querySelectorAll(".tab[data-tab]");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      document.querySelectorAll(".tab-panel").forEach(function (panel) {
        panel.classList.toggle("active", panel.id === "panel-" + name);
      });
    });
  });

  // Forms
  var form = document.getElementById("contact-form");
  var formResult = document.getElementById("form-result");
  if (form && formResult) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim();
      var email = String(data.get("email") || "").trim();
      if (!name || !email) {
        formResult.textContent = "Please fill name and email.";
        formResult.classList.add("show");
        formResult.style.borderColor = "var(--danger)";
        formResult.style.color = "var(--danger)";
        formResult.style.background = "#3a1e1e";
        return;
      }
      formResult.style.borderColor = "";
      formResult.style.color = "";
      formResult.style.background = "";
      formResult.textContent =
        "Submitted: " +
        name +
        " <" +
        email +
        "> role=" +
        (data.get("role") || "none") +
        " newsletter=" +
        (data.get("newsletter") ? "yes" : "no");
      formResult.classList.add("show");
    });
  }

  // About
  var ack = document.getElementById("btn-ack");
  var aboutToast = document.getElementById("about-toast");
  if (ack) {
    ack.addEventListener("click", function () {
      showToast(aboutToast, "Acknowledged");
    });
  }
})();
