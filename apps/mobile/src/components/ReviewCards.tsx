import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileService, ReviewComment, ReviewSummary } from '../services/profile.service';
import { useLocale, formatEventDate } from '../i18n';
import { colors, radius, type } from '../theme';

export default function ReviewCards({
  items,
  onAuthorPress,
  onEventPress,
}: {
  items: ReviewSummary[];
  onAuthorPress(userId: string): void;
  onEventPress?(eventId: string): void;
}) {
  const { t, isRTL } = useLocale();
  const [reviews, setReviews] = useState(items);
  const [activeReview, setActiveReview] = useState<ReviewSummary | null>(null);

  useEffect(() => setReviews(items), [items]);

  const toggleLike = async (review: ReviewSummary) => {
    if (!review.canInteract) {
      Alert.alert(
        t('review_follow_required_title'),
        t('review_follow_required', { name: review.user?.name || t('profile_user') }),
      );
      return;
    }
    const wasLiked = review.likedByMe;
    setReviews(current => current.map(item => item.id === review.id
      ? { ...item, likedByMe: !wasLiked, likeCount: Math.max(0, item.likeCount + (wasLiked ? -1 : 1)) }
      : item));
    try {
      const result = wasLiked
        ? await profileService.unlikeReview(review.id)
        : await profileService.likeReview(review.id);
      setReviews(current => current.map(item => item.id === review.id ? { ...item, ...result } : item));
    } catch {
      setReviews(current => current.map(item => item.id === review.id
        ? { ...item, likedByMe: wasLiked, likeCount: review.likeCount }
        : item));
      Alert.alert(t('error'), t('please_try_again'));
    }
  };

  return (
    <>
      <View style={styles.list}>
        {reviews.map(review => (
          <View key={review.id} style={styles.card}>
            <View style={[styles.authorRow, isRTL && styles.rowRtl]}>
              <TouchableOpacity accessibilityRole="button" onPress={() => review.user?.id && onAuthorPress(review.user.id)}>
                {review.user?.avatar ? (
                  <Image source={{ uri: review.user.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}><Ionicons name="person" size={18} color={colors.primary} /></View>
                )}
              </TouchableOpacity>
              <View style={styles.authorCopy}>
                <TouchableOpacity accessibilityRole="button" onPress={() => review.user?.id && onAuthorPress(review.user.id)}>
                  <Text style={styles.authorName}>{review.user?.name || t('profile_user')}</Text>
                </TouchableOpacity>
                <Text style={styles.date}>{formatEventDate(review.createdAt)}</Text>
              </View>
              <View style={[styles.rating, isRTL && styles.rowRtl]}>
                <Ionicons name="star" size={15} color={colors.warning} />
                <Text style={styles.ratingText}>{review.rating}</Text>
              </View>
            </View>
            {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
            {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
            {review.event ? (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!onEventPress}
                onPress={() => onEventPress?.(review.event!.id)}
                style={[styles.eventRow, isRTL && styles.rowRtl]}
              >
                {review.event.coverImage ? <Image source={{ uri: review.event.coverImage }} style={styles.eventImage} /> : (
                  <View style={styles.eventImageFallback}><Ionicons name="calendar-outline" size={18} color={colors.primary} /></View>
                )}
                <Text numberOfLines={2} style={[styles.eventTitle, isRTL && styles.textRtl]}>{review.event.title}</Text>
                {onEventPress ? <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.textMuted} /> : null}
              </TouchableOpacity>
            ) : null}
            <View style={[styles.actions, isRTL && styles.rowRtl]}>
              <TouchableOpacity accessibilityRole="button" onPress={() => void toggleLike(review)} style={styles.action}>
                <Ionicons name={review.likedByMe ? 'heart' : 'heart-outline'} size={18} color={review.likedByMe ? colors.danger : colors.textSecondary} />
                <Text style={styles.actionText}>{review.likeCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => setActiveReview(review)} style={styles.action}>
                <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.actionText}>{review.commentCount}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
      <ReviewCommentsModal
        review={activeReview}
        onClose={() => setActiveReview(null)}
        onAuthorPress={onAuthorPress}
        onCountChange={count => {
          if (!activeReview) return;
          setReviews(current => current.map(item => item.id === activeReview.id ? { ...item, commentCount: count } : item));
        }}
        reviewerName={activeReview?.user?.name || t('profile_user')}
      />
    </>
  );
}

function ReviewCommentsModal({
  review,
  onClose,
  onAuthorPress,
  onCountChange,
  reviewerName,
}: {
  review: ReviewSummary | null;
  onClose(): void;
  onAuthorPress(userId: string): void;
  onCountChange(count: number): void;
  reviewerName: string;
}) {
  const { t, isRTL } = useLocale();
  const [items, setItems] = useState<ReviewComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!review) return;
    setLoading(true);
    void profileService.comments(review.id)
      .then(result => setItems(result.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [review?.id]);

  const submit = async () => {
    if (!review || !body.trim() || saving) return;
    setSaving(true);
    try {
      const created = await profileService.addComment(review.id, body.trim());
      setItems(current => [...current, created]);
      setBody('');
      onCountChange(items.length + 1);
    } catch (error: any) {
      Alert.alert(
        error?.response?.data?.code === 'FOLLOW_REQUIRED' ? t('review_follow_required_title') : t('error'),
        error?.response?.data?.error || t('please_try_again'),
      );
    } finally {
      setSaving(false);
    }
  };

  const removeComment = async (comment: ReviewComment) => {
    if (!review) return;
    try {
      await profileService.deleteComment(review.id, comment.id);
      setItems(current => current.filter(item => item.id !== comment.id));
      onCountChange(Math.max(0, items.length - 1));
    } catch {
      Alert.alert(t('error'), t('please_try_again'));
    }
  };

  return (
    <Modal visible={Boolean(review)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={[styles.modalHeader, isRTL && styles.rowRtl]}>
            <Text style={styles.modalTitle}>{t('review_comments')}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          <ScrollView style={styles.commentsList} contentContainerStyle={styles.commentsContent}>
            {items.map(comment => (
              <View key={comment.id} style={[styles.commentRow, isRTL && styles.rowRtl]}>
                <TouchableOpacity accessibilityRole="button" onPress={() => onAuthorPress(comment.user.id)}>
                  {comment.user.avatar ? <Image source={{ uri: comment.user.avatar }} style={styles.commentAvatar} /> : (
                    <View style={styles.commentAvatarFallback}><Ionicons name="person" size={14} color={colors.primary} /></View>
                  )}
                </TouchableOpacity>
                <View style={styles.commentCopy}>
                  <Text style={styles.commentAuthor}>{comment.user.name}</Text>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
                {comment.canDelete ? (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('delete_comment')} onPress={() => void removeComment(comment)}>
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {!loading && items.length === 0 ? <Text style={styles.emptyComments}>{t('review_no_comments')}</Text> : null}
          </ScrollView>
          {review?.canInteract ? (
            <View style={[styles.composeRow, isRTL && styles.rowRtl]}>
              <TextInput
                value={body}
                onChangeText={setBody}
                maxLength={1000}
                placeholder={t('review_add_comment')}
                placeholderTextColor={colors.textMuted}
                style={[styles.composeInput, isRTL && styles.inputRtl]}
              />
              <TouchableOpacity accessibilityRole="button" disabled={!body.trim() || saving} onPress={() => void submit()} style={styles.sendButton}>
                {saving ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Ionicons name="send" size={18} color={colors.textInverse} />}
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.followPrompt}>{t('review_follow_required', { name: reviewerName })}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowRtl: { flexDirection: 'row-reverse' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  authorCopy: { flex: 1 },
  authorName: { color: colors.text, fontWeight: '700' },
  date: { ...type.caption, marginTop: 2 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: colors.text, fontWeight: '800' },
  reviewTitle: { ...type.h3, color: colors.ink },
  comment: { ...type.body, color: colors.textSecondary },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.sm, backgroundColor: colors.bg },
  eventImage: { width: 56, height: 48, borderRadius: radius.sm },
  eventImageFallback: { width: 56, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  eventTitle: { flex: 1, ...type.caption, color: colors.primaryDark, fontWeight: '700' },
  textRtl: { textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: colors.surfaceAlt, paddingTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  actionText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,15,46,0.56)' },
  modalCard: { height: '78%', padding: 20, paddingBottom: 28, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14 },
  modalTitle: { ...type.h2, color: colors.ink },
  commentsList: { flex: 1 },
  commentsContent: { gap: 14, paddingVertical: 8 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  commentAvatar: { width: 30, height: 30, borderRadius: 15 },
  commentAvatarFallback: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  commentCopy: { flex: 1 },
  commentAuthor: { color: colors.text, fontWeight: '700', fontSize: 13 },
  commentBody: { color: colors.textSecondary, fontSize: 14, marginTop: 3 },
  emptyComments: { ...type.body, textAlign: 'center', color: colors.textMuted, marginTop: 20 },
  composeRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 12 },
  composeInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 15, color: colors.text },
  inputRtl: { textAlign: 'right' },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  followPrompt: { color: colors.textMuted, textAlign: 'center', paddingVertical: 14 },
});
