import next from "eslint-config-next/core-web-vitals";

/**
 * Flat ESLint config.
 *
 * `eslint-config-next` ships a flat-config array; `core-web-vitals` adds the
 * web-vitals and accessibility rule sets on top of the base config. The
 * accessibility rules matter here: this app is used by people who are not
 * confident with technology, so keyboard and screen-reader behaviour is a
 * product requirement, not a nicety.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...next,
];

export default config;