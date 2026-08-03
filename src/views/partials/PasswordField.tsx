/** @jsxImportSource hono/jsx */
import { EyeIcon, EyeOffIcon } from "./ClipIcons";

interface PasswordFieldProps {
  name: string;
  placeholder?: string;
  required?: boolean;
  minlength?: number;
  autocomplete?: string;
  class?: string;
}

/** Password input with a show/hide toggle; behaviour lives in app.js. */
export function PasswordField({
  name,
  placeholder,
  required,
  minlength,
  autocomplete,
  class: className,
}: PasswordFieldProps) {
  return (
    <div class={className ? `password-field ${className}` : "password-field"}>
      <input
        type="password"
        name={name}
        placeholder={placeholder}
        class="slug-input password-field__input"
        required={required}
        minlength={minlength}
        autocomplete={autocomplete}
      />
      <button
        type="button"
        class="password-field__toggle"
        data-password-toggle
        aria-label="Show password"
        aria-pressed="false"
      >
        <span class="password-field__icon password-field__icon--show">
          <EyeIcon />
        </span>
        <span class="password-field__icon password-field__icon--hide">
          <EyeOffIcon />
        </span>
      </button>
    </div>
  );
}
