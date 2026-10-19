export interface DatePickerDefaultOptions {
  /**
   * Called whenever the native date input's value changes.
   */
  onChange?: (value: string) => void;
}

/**
 * Seeds the native date input with today's date on focus so that iOS Safari
 * opens the picker to the current date. On blur, if the user did not pick
 * anything, the empty value is restored.
 */
export function primePickerToNow(
  input: HTMLInputElement,
  options: DatePickerDefaultOptions = {},
): () => void {
  const { onChange } = options;

  const handleFocus = () => {
    if (!input.value) {
      input.value = toDateInputValue(new Date());
    }
  };

  const handleBlur = () => {
    if (!input.value) {
      input.value = '';
    }
  };

  const handleChange = () => {
    onChange?.(input.value);
  };

  input.addEventListener('focus', handleFocus);
  input.addEventListener('blur', handleBlur);
  input.addEventListener('change', handleChange);

  return () => {
    input.removeEventListener('focus', handleFocus);
    input.removeEventListener('blur', handleBlur);
    input.removeEventListener('change', handleChange);
  };
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
