(function () {
  const tauri = window.__TAURI__;
  if (!tauri) return;

  const HUD_BUILD = "b3";
  const EVENT_RUNS = "ringer-runs";
  const app = document.getElementById("app");
  const webHeader = document.querySelector(".topbar");
  let latestRuns = [];

  document.documentElement.classList.add("tauri-hud");
  document.title = `Ringside ${HUD_BUILD}`;

  const style = document.createElement("style");
  style.textContent = `
    .tauri-hud, .tauri-hud body {
      height: 100%;
      min-height: 100%;
      overflow: hidden;
      background: transparent;
    }
    .tauri-hud body:before { display: none; }
    .tauri-hud .shell {
      width: 100%;
      height: 100%;
      padding: 0;
      overflow: hidden;
      border-radius: 14px;
      background:
        radial-gradient(circle at 50% -20%, rgba(40,215,255,.14), transparent 24rem),
        linear-gradient(180deg, rgba(8,10,15,.94), rgba(13,17,25,.97) 60%, rgba(8,10,15,.94));
      box-shadow: 0 18px 50px rgba(0,0,0,.38);
    }
    /* The web dashboard's own header is not used in the HUD at all —
       the HUD builds its own bar so no inherited layout can break it. */
    .tauri-hud .topbar { display: none !important; }
    #hud-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 34px;
      z-index: 1000;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 9px;
      padding: 0 8px 0 14px;
      box-sizing: border-box;
      border-bottom: 1px solid rgba(255,255,255,.10);
      background: rgba(5,8,12,.50);
      user-select: none;
      -webkit-user-select: none;
    }
    #hud-bar .hud-dot {
      width: 10px;
      height: 10px;
      flex: 0 0 10px;
      border-radius: 50%;
      background: #5c6675;
    }
    #hud-bar .hud-dot.live { background: #35d5ff; animation: dotPulse 1.35s infinite; }
    #hud-bar .hud-dot.pass { background: #3ddc84; }
    #hud-bar .hud-dot.fail { background: #ff5468; }
    #hud-bar .hud-title {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: 700 12px/34px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #eef4ff;
    }
    .tauri-hud #app {
      height: calc(100% - 34px);
      margin-top: 34px;
      gap: 10px;
      padding: 10px;
      overflow: auto;
      box-sizing: border-box;
    }
    .tauri-hud .tasks {
      grid-template-columns: repeat(auto-fill, minmax(106px, 1fr));
    }
    /* macOS traffic-light close button, top-left like every Mac app. */
    #hud-close {
      width: 12px;
      height: 12px;
      min-width: 12px;
      flex: 0 0 12px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(255,255,255,.22);
      color: transparent;
      font: 700 9px/12px system-ui, sans-serif;
      text-align: center;
      cursor: pointer;
      position: relative;
      z-index: 30;
      transition: background .15s ease;
    }
    #hud-bar:hover #hud-close { background: #ff5f57; }
    #hud-close:hover { color: rgba(60,0,0,.75); }
  `;
  document.head.appendChild(style);

  // Surface any frontend failure where AX can read it: the window title.
  window.addEventListener("error", event => {
    document.title = `Ringside ERR: ${event.message}`.slice(0, 120);
  });

  // Build the HUD's own bar from scratch.
  // Order: close button far left (macOS convention), then dot, then ticker.
  if (webHeader) webHeader.style.display = "none";
  const bar = document.createElement("div");
  bar.id = "hud-bar";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.id = "hud-close";
  closeButton.title = "Close";
  closeButton.textContent = "×";
  const dot = document.createElement("span");
  dot.className = "hud-dot";
  const title = document.createElement("span");
  title.className = "hud-title";
  title.textContent = "no ringers running";
  bar.append(closeButton, dot, title);
  // The script may execute from <head> before <body> exists.
  const attachBar = () => document.body.appendChild(bar);
  if (document.body) {
    attachBar();
  } else {
    document.addEventListener("DOMContentLoaded", attachBar);
  }

  const currentWindow = tauri.window?.getCurrentWindow?.();
  const noDragSelector = "button, a, input, select, textarea, [data-no-drag]";

  // Swift-HUD parity: the whole background drags, while real controls stay
  // clickable even when nested inside draggable-looking chrome.
  document.addEventListener("mousedown", event => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    if (target.closest(noDragSelector)) return;
    const drag = currentWindow?.startDragging?.();
    if (drag?.catch) drag.catch(() => {});
  });

  closeButton.addEventListener("click", event => {
    event.stopPropagation();
    invoke("hide_window");
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      invoke("hide_window");
    }
  });

  listen(EVENT_RUNS, event => {
    latestRuns = Array.isArray(event.payload) ? event.payload : [];
    update(latestRuns);
    renderHudTitle(latestRuns);
  });

  function renderHudTitle(runs) {
    const liveRuns = runs.filter(run => run.state === "live");
    let dotState = "";
    if (liveRuns.length > 0) {
      const agents = liveRuns.reduce((sum, run) => sum + (run.tasks || []).length, 0);
      title.textContent = `${liveRuns.length} ringer${liveRuns.length === 1 ? "" : "s"} · ${agents} agent${agents === 1 ? "" : "s"}`;
      dotState = liveRuns.some(run => numberOrZero(run.fail) > 0) ? "fail" : "live";
    } else if (runs.length > 0) {
      const newest = newestRun(runs);
      title.textContent = finalTickerText(newest);
      dotState = newest.state === "died" || numberOrZero(newest.fail) > 0 ? "fail" : "pass";
    } else {
      title.textContent = "no ringers running";
    }
    dot.className = `hud-dot${dotState ? " " + dotState : ""}`;
  }

  function finalTickerText(run) {
    const name = run.run_name || "ringer";
    if (run.state === "died") return `${name} · died`;
    const pass = numberOrZero(run.pass ?? run.summary?.pass ?? run.totals?.pass);
    const fail = numberOrZero(run.fail ?? run.summary?.fail ?? run.totals?.fail);
    return `${name} · ok ${pass} fail ${fail}`;
  }

  function newestRun(runs) {
    return runs.reduce((latest, run) => {
      return runTimestamp(run) > runTimestamp(latest) ? run : latest;
    }, runs[0]);
  }

  function runTimestamp(run) {
    const modified = Number(run?.mtime);
    if (Number.isFinite(modified)) return modified * 1000;
    const started = Date.parse(run?.started_at || "");
    return Number.isFinite(started) ? started : 0;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function invoke(command) {
    return tauri.core.invoke(command);
  }

  function listen(eventName, handler) {
    return tauri.event.listen(eventName, handler);
  }
})();
