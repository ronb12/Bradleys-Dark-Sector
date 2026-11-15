// Avoid service-worker caching during Vite hot reload, so live previews remain current.
export function registerPWA() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const showUpdate = (registration: ServiceWorkerRegistration) => {
    if (!navigator.serviceWorker.controller || !registration.waiting || document.querySelector("[data-dark-sector-update]")) return;
    const banner = document.createElement("aside");
    banner.setAttribute("data-dark-sector-update", "true");
    banner.setAttribute("role", "status");
    Object.assign(banner.style, {
      position: "fixed", bottom: "max(1rem, env(safe-area-inset-bottom))",
      left: "50%", transform: "translateX(-50%)", zIndex: "999999",
      background: "#071321", color: "#dcf9fa", border: "1px solid #26dbdc",
      padding: "12px 16px", borderRadius: "12px", display: "flex",
      gap: "14px", alignItems: "center", fontFamily: "system-ui, sans-serif",
      fontSize: "14px", boxShadow: "0 10px 30px #0009"
    });
    banner.append("Dark Sector update available");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Update game";
    Object.assign(button.style, { background: "#26dbdc", color: "#071321", border: "0", padding: "8px 12px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" });
    button.addEventListener("click", () => registration.waiting?.postMessage({ type: "SKIP_WAITING" }));
    banner.append(button);
    document.body.append(banner);
  };

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (registration.waiting) showUpdate(registration);
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", () => {
          if (registration.waiting) showUpdate(registration);
        });
      });
    }).catch((error) => console.warn("Dark Sector offline setup unavailable:", error));
  }, { once: true });

  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.location.reload();
    hadController = true;
  });
}
