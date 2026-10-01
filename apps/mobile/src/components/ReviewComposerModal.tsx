import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { colors, radius, type } from '../theme';

export type ReviewDraft = { rating: number; title: string; comment: string };

export default function ReviewComposerModal({
  visible,
  initial,
  saving = false,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initial?: Partial<ReviewDraft> | null;
  saving?: boolean;
  onClose(): void;
  onSubmit(draft: ReviewDraft): void;
}) {
  const { t, isRTL } = useLocale();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!visible) return;
    setRating(initial?.rating || 5);
    setTitle(initial?.title || '');
    setComment(initial?.comment || '');
  }, [visible, initial?.rating, initial?.title, initial?.comment]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.heading, isRTL && styles.rowRtl]}>
            <Text style={styles.title}>{initial?.rating ? t('edit_review') : t('write_review')}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>{t('review_rating')}</Text>
          <View style={[styles.stars, isRTL && styles.rowRtl]}>
            {[1, 2, 3, 4, 5].map(value => (
              <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={t('review_rating_value', { count: value })} onPress={() => setRating(value)}>
                <Ionicons name={value <= rating ? 'star' : 'star-outline'} size={30} color={colors.warning} />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder={t('review_title_optional')}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, isRTL && styles.inputRtl]}
          />
          <TextInput
            value={comment}
            onChangeText={setComment}
            maxLength={2000}
            multiline
            textAlignVertical="top"
            placeholder={t('review_comment_optional')}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.commentInput, isRTL && styles.inputRtl]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={saving}
            onPress={() => onSubmit({ rating, title: title.trim(), comment: comment.trim() })}
            style={[styles.submit, saving && styles.submitDisabled]}
          >
            {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.submitText}>{t('review_submit')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(20,15,46,0.56)' },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 22, borderRadius: radius.lg, backgroundColor: colors.surface, gap: 14 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowRtl: { flexDirection: 'row-reverse' },
  title: { ...type.h2, color: colors.ink },
  label: { ...type.label, color: colors.textSecondary },
  stars: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
  inputRtl: { textAlign: 'right' },
  commentInput: { minHeight: 120, paddingTop: 12 },
  submit: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primary },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: colors.textInverse, fontWeight: '800' },
});
