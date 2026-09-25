const quodeName = document.querySelector('script[data-reload-scope]')?.dataset.reloadScope || decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[0] || "");
let currentRevision;
let events;

function reloadWithoutCache() {
  const destination = new URL(window.location.href);
  destination.searchParams.set("_quode_reload", Date.now().toString());
  window.location.replace(destination);
}

function connect() {
  if (!quodeName) return;
  events = new EventSource(`/api/dev/events/${encodeURIComponent(quodeName)}`);
  events.addEventListener("ready", (event) => {
    if (currentRevision && event.data !== currentRevision) {
      reloadWithoutCache();
      return;
    }
    currentRevision = event.data;
  });
  events.addEventListener("reload", () => {
    console.info("[Quode] Development files changed; reloading");
    reloadWithoutCache();
  });
}

window.addEventListener("pagehide", () => events?.close());
window.addEventListener("pageshow", event => { if (event.persisted) connect(); });
connect();
