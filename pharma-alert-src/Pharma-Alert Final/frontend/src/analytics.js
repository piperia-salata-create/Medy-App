const isProduction = process.env.NODE_ENV === "production";

const loadScript = (src, { async = true, defer = false, crossOrigin } = {}) =>
  new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = async;
    if (defer) script.defer = true;
    if (crossOrigin) script.crossOrigin = crossOrigin;

    script.onload = () => resolve();
    script.onerror = (err) => reject(err);

    document.head.appendChild(script);
  });

const injectEmergentBadge = () => {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById("emergent-badge")) {
    return;
  }

  const badge = document.createElement("a");
  badge.id = "emergent-badge";
  badge.target = "_blank";
  badge.href = "https://app.emergent.sh/?utm_source=emergent-badge";
  badge.style.cssText =
    "display: flex !important;" +
    "align-items: center !important;" +
    "position: fixed !important;" +
    "bottom: 20px;" +
    "right: 20px;" +
    "text-decoration: none;" +
    "padding: 6px 10px;" +
    "font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Oxygen, Ubuntu, Cantarell, \"Open Sans\", \"Helvetica Neue\", sans-serif !important;" +
    "font-size: 12px !important;" +
    "z-index: 9999 !important;" +
    "box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;" +
    "border-radius: 8px !important;" +
    "background-color: #ffffff !important;" +
    "border: 1px solid rgba(255, 255, 255, 0.25) !important;";

  badge.innerHTML =
    '<div style="display: flex; flex-direction: row; align-items: center">' +
    '<img style="width: 20px; height: 20px; margin-right: 8px" src="https://avatars.githubusercontent.com/in/1201222?s=120&u=2686cf91179bbafbc7a71bfbc43004cf9ae1acea&v=4" />' +
    '<p style="color: #000000; font-family: -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, Oxygen, Ubuntu, Cantarell, &quot;Open Sans&quot;, &quot;Helvetica Neue&quot;, sans-serif !important; font-size: 12px !important; align-items: center; margin-bottom: 0;">' +
    "Made with Emergent" +
    "</p>" +
    "</div>";

  document.body.appendChild(badge);
};

const initEmergent = async () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    await loadScript("https://assets.emergent.sh/scripts/emergent-main.js");
  } catch (err) {
    console.warn("Emergent script failed to load", err);
  }

  if (window.self !== window.top) {
    try {
      await loadScript("https://assets.emergent.sh/scripts/debug-monitor.js");
    } catch (err) {
      console.warn("Emergent debug monitor failed to load", err);
    }

    try {
      window.tailwind = window.tailwind || {};
      window.tailwind.config = {
        corePlugins: { preflight: false },
      };

      await loadScript("https://cdn.tailwindcss.com");
    } catch (err) {
      console.warn("Tailwind CDN failed to load", err);
    }
  }

  try {
    injectEmergentBadge();
  } catch (err) {
    console.warn("Emergent badge failed to load", err);
  }
};

const initPosthog = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  try {
    (function (t, e) {
      let o;
      let n;
      let p;
      let r;
      if (e.__SV) {
        return;
      }

      window.posthog = e;
      e._i = [];
      e.init = function (i, s, a) {
        function g(t, e) {
          const o = e.split(".");
          if (o.length === 2) {
            t = t[o[0]];
            e = o[1];
          }
          t[e] = function () {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }

        p = t.createElement("script");
        p.type = "text/javascript";
        p.crossOrigin = "anonymous";
        p.async = true;
        p.src =
          s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") +
          "/static/array.js";
        r = t.getElementsByTagName("script")[0];
        r.parentNode.insertBefore(p, r);

        let u = e;
        if (a !== undefined) {
          u = e[a] = [];
        } else {
          a = "posthog";
        }

        u.people = u.people || [];
        u.toString = function (t) {
          let e = "posthog";
          if (a !== "posthog") {
            e += "." + a;
          }
          if (!t) {
            e += " (stub)";
          }
          return e;
        };
        u.people.toString = function () {
          return u.toString(1) + ".people (stub)";
        };
        o =
          "init me ws ys ps bs capture je Di ks register register_once register_for_session unregister unregister_for_session Ps getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty Es $s createPersonProfile Is opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing Ss debug xs getPageViewId captureTraceFeedback captureTraceMetric".split(
            " ",
          );
        for (n = 0; n < o.length; n += 1) {
          g(u, o[n]);
        }
        e._i.push([i, s, a]);
      };
      e.__SV = 1;
    })(document, window.posthog || []);

    if (window.posthog && typeof window.posthog.init === "function") {
      window.posthog.init(
        "phc_xAvL2Iq4tFmANRE7kzbKwaSqp1HJjN7x48s3vr0CMjs",
        {
          api_host: "https://us.i.posthog.com",
          person_profiles: "identified_only",
          session_recording: {
            recordCrossOriginIframes: true,
          },
        },
      );
    }
  } catch (err) {
    console.warn("PostHog failed to initialize", err);
  }
};

const initAnalytics = async () => {
  await initEmergent();
  initPosthog();
};

const startAnalytics = async () => {
  if (!isProduction) {
    return;
  }

  try {
    await initAnalytics();
  } catch (err) {
    console.warn("Analytics failed to load", err);
  }
};

startAnalytics();
