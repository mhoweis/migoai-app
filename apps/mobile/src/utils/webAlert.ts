import { Alert, AlertButton, Platform } from 'react-native';

// react-native-web ships Alert.alert as a no-op, so every alert in the app
// silently did nothing in the browser. Map it onto the browser's own dialogs:
// one button -> window.alert, two or more -> window.confirm (OK runs the first
// non-cancel button, Cancel runs the cancel button if there is one).
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = buttons ?? [];

    if (actions.length <= 1) {
      window.alert(text);
      actions[0]?.onPress?.();
      return;
    }

    const cancel = actions.find(button => button.style === 'cancel');
    const confirm = actions.find(button => button !== cancel) ?? actions[0];
    if (window.confirm(text)) {
      confirm.onPress?.();
    } else {
      cancel?.onPress?.();
    }
  };
}
