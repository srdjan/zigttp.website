// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    const container = tab.closest(".code-tabs");

    container
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    container
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));

    tab.classList.add("active");
    container.querySelector(`#tab-${target}`).classList.add("active");
  });
});

// Animate benchmark bars on scroll
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll(".bench-bar[data-animate]").forEach(
          (bar, i) => {
            setTimeout(() => bar.classList.add("animated"), i * 80);
          },
        );
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 },
);

const benchGrid = document.querySelector(".bench-grid");
if (benchGrid) observer.observe(benchGrid);

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});
