/**
 * Config plugin — corrige recomendações do Play Console (edge-to-edge, tela grande, bitmap, R8).
 * Aplicado no prebuild; não gera pasta android commitada.
 */
const {
  withAppBuildGradle,
  withGradleProperties,
  withAndroidManifest,
  withMainActivity,
  createRunOncePlugin,
} = require("expo/config-plugins");

const PLUGIN_NAME = "withPlayConsoleAndroidFixes";
const PLUGIN_VERSION = "1.0.0";

/** R8 full mode + resource shrinking otimizado (AGP 8.x). */
function withR8GradleProperties(config) {
  return withGradleProperties(config, (cfg) => {
    const keys = {
      "android.enableR8.fullMode": "true",
      "android.enableMinifyInReleaseBuilds": "true",
      "android.enableShrinkResourcesInReleaseBuilds": "true",
      "android.enablePngCrunchInReleaseBuilds": "true",
      "android.r8.optimizedResourceShrinking": "true",
    };
    for (const [key, value] of Object.entries(keys)) {
      const idx = cfg.modResults.findIndex(
        (item) => item.type === "property" && item.key === key,
      );
      if (idx >= 0) {
        cfg.modResults[idx] = { type: "property", key, value };
      } else {
        cfg.modResults.push({ type: "property", key, value });
      }
    }
    return cfg;
  });
}

/**
 * Troca proguard-android.txt (inclui -dontoptimize) por proguard-android-optimize.txt
 * para isOptimizationsEnabled=true no r8.json do AAB.
 */
function withOptimizeProguardFile(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes("proguard-android.txt")) {
      contents = contents.replace(
        /getDefaultProguardFile\(["']proguard-android\.txt["']\)/g,
        'getDefaultProguardFile("proguard-android-optimize.txt")',
      );
    }
    if (!contents.includes("proguard-android-optimize.txt")) {
      throw new Error(
        `${PLUGIN_NAME}: não encontrou proguardFiles com optimize.txt após o patch`,
      );
    }
    // Garante crunchPngs true no release se a linha existir
    contents = contents.replace(
      /crunchPngs\s*\([^)]*\)/g,
      "crunchPngs true",
    );
    cfg.modResults.contents = contents;
    return cfg;
  });
}

/** Large screen: activity redimensionável, sem orientação/aspect ratio fixos. */
function withLargeScreenManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return cfg;

    const activities = app.activity ?? [];
    for (const activity of activities) {
      const name = activity.$?.["android:name"] ?? "";
      const isMain =
        name === ".MainActivity" || name.endsWith(".MainActivity");
      if (!isMain) continue;

      activity.$ = activity.$ || {};
      // remove trava portrait/landscape
      delete activity.$["android:screenOrientation"];
      delete activity.$["android:maxAspectRatio"];
      delete activity.$["android:minAspectRatio"];
      activity.$["android:resizeableActivity"] = "true";
      // permite rotação / multi-window sem letterbox forçado
      const existingConfig = activity.$["android:configChanges"] || "";
      const needed = [
        "keyboard",
        "keyboardHidden",
        "orientation",
        "screenSize",
        "screenLayout",
        "uiMode",
        "smallestScreenSize",
      ];
      const parts = new Set(
        existingConfig
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      for (const n of needed) parts.add(n);
      activity.$["android:configChanges"] = [...parts].join("|");
    }

    // supports-screens amplo (tablets / foldables)
    if (!manifest["supports-screens"]) {
      manifest["supports-screens"] = [
        {
          $: {
            "android:smallScreens": "true",
            "android:normalScreens": "true",
            "android:largeScreens": "true",
            "android:xlargeScreens": "true",
            "android:anyDensity": "true",
            "android:resizeable": "true",
          },
        },
      ];
    }

    return cfg;
  });
}

/**
 * Edge-to-edge moderno: EdgeToEdge.enable() / WindowCompat no MainActivity
 * (evita FLAG_TRANSLUCENT_* e APIs de cor de system bar descontinuadas).
 */
function withModernEdgeToEdgeMainActivity(config) {
  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    const isKotlin = cfg.modResults.language === "kt";

    if (isKotlin) {
      if (!contents.includes("androidx.activity.enableEdgeToEdge")) {
        contents = contents.replace(
          /(package\s+[^\n]+\n)/,
          "$1\nimport androidx.activity.enableEdgeToEdge\n",
        );
      }
      if (!contents.includes("enableEdgeToEdge(")) {
        // Inserir no onCreate após super.onCreate
        if (/override\s+fun\s+onCreate\s*\([^)]*\)\s*\{/.test(contents)) {
          contents = contents.replace(
            /(override\s+fun\s+onCreate\s*\([^)]*\)\s*\{[\s\S]*?super\.onCreate\([^)]*\))/,
            "$1\n    enableEdgeToEdge()",
          );
        }
      }
    } else {
      // Java MainActivity (Expo clássico)
      if (!contents.includes("androidx.activity.EdgeToEdge")) {
        contents = contents.replace(
          /(package\s+[^;]+;)/,
          "$1\n\nimport androidx.activity.EdgeToEdge;",
        );
      }
      if (!contents.includes("EdgeToEdge.enable")) {
        contents = contents.replace(
          /(super\.onCreate\([^)]*\);)/,
          "$1\n    EdgeToEdge.enable(this);",
        );
      }
    }

    // Remover opt-out de edge-to-edge se alguém injetar
    contents = contents.replace(
      /WindowCompat\.setDecorFitsSystemWindows\(\s*getWindow\(\)\s*,\s*true\s*\)\s*;?/g,
      "WindowCompat.setDecorFitsSystemWindows(getWindow(), false);",
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withPlayConsoleAndroidFixes(config) {
  config = withR8GradleProperties(config);
  config = withOptimizeProguardFile(config);
  config = withLargeScreenManifest(config);
  config = withModernEdgeToEdgeMainActivity(config);
  return config;
}

module.exports = createRunOncePlugin(
  withPlayConsoleAndroidFixes,
  PLUGIN_NAME,
  PLUGIN_VERSION,
);
