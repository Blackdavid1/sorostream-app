import { datePickerDefault } from './datePickerDefault';

describe('datePickerDefault', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = document.createElement('input');
    input.type = 'date';
    input.value = '';
    document.body.appendChild(input);
  });

  afterEach(() => {
    document.body.removeChild(input);
  });

  it('seeds the input with today on focus without touching React state', () => {
    const onChange = jest.fn();
    const { onFocus } = datePickerDefault({ onChange });

    onFocus({ currentTarget: input } as unknown as React.FocusEvent<HTMLInputElement>);

    expect(input.value).not.toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores the empty value on blur when no selection was made', () => {
    const onChange = jest.fn();
    const { onFocus, onBlur } = datePickerDefault({ onChange });

    onFocus({ currentTarget: input } as unknown as React.FocusEvent<HTMLInputElement>);
    onBlur({ currentTarget: input } as unknown as React.FocusEvent<HTMLInputElement>);

    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves the selected value on blur after a real selection', () => {
    const onChange = jest.fn();
    const { onFocus, onBlur, onChange: handleChange } = datePickerDefault({ onChange });

    onFocus({ currentTarget: input } as unknown as React.FocusEvent<HTMLInputElement>);

    input.value = '2024-01-15';
    handleChange({ currentTarget: input } as unknown as React.ChangeEvent<HTMLInputElement>);

    onBlur({ currentTarget: input } as unknown as React.FocusEvent<HTMLInputElement>);

    expect(input.value).toBe('2024-01-15');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
