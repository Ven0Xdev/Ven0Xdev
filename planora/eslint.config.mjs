import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // חתימות של מימושים עתידיים אינן משתמשות בפרמטרים — הקידומת _ מסמנת זאת
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "scripts/_*"]),
]);

export default eslintConfig;
