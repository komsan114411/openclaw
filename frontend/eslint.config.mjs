import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const eslintConfig = [
    ...compat.extends("next/core-web-vitals", "next/typescript"),
    {
        rules: {
            // Existing codebase uses `any` in many places; do not block CI.
            '@typescript-eslint/no-explicit-any': 'off',
            // Many pages intentionally ignore certain response fields/errors.
            '@typescript-eslint/no-unused-vars': 'off',
            // Images are loaded from base64/external CDNs - HTML img is appropriate
            '@next/next/no-img-element': 'off',
        },
    },
];

export default eslintConfig;
