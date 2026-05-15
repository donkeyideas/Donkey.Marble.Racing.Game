import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import BackButton from '../components/BackButton';
import { api, getToken, SupportTicketSummary, SupportTicketDetail } from '../lib/api';
import { FAQ_ITEMS } from '../data/faq';

const CATEGORIES = [
  { id: 'bug', label: 'Bug', color: Colors.blueSky },
  { id: 'account', label: 'Account', color: '#c39bd3' },
  { id: 'purchase', label: 'Purchase', color: Colors.yellow },
  { id: 'refund', label: 'Refund', color: Colors.red },
  { id: 'other', label: 'Other', color: Colors.whiteAlpha50 },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: 'rgba(231,76,60,0.15)', text: Colors.red },
  pending: { bg: 'rgba(255,194,32,0.15)', text: Colors.yellow },
  resolved: { bg: 'rgba(46,204,113,0.15)', text: Colors.green },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SupportScreen() {
  const router = useRouter();
  const [view, setView] = useState<'main' | 'create' | 'chat'>('main');
  const [hasAuth, setHasAuth] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create ticket state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Chat state
  const [chatTicket, setChatTicket] = useState<SupportTicketDetail | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // FAQ state
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const token = await getToken();
    setHasAuth(!!token);
    if (token) loadTickets();
    else setLoading(false);
  }

  async function loadTickets() {
    try {
      setError(null);
      const res = await api.support.listTickets();
      setTickets(res.tickets);
    } catch (e: any) {
      setError(e.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTicket() {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.support.createTicket({
        subject: subject.trim(),
        category,
        message: message.trim(),
      });
      // Open the newly created ticket in chat
      setSubject('');
      setMessage('');
      setCategory('bug');
      openChat(res.ticket.id);
    } catch (e: any) {
      setError(e.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  const openChat = useCallback(async (ticketId: string) => {
    setChatLoading(true);
    setView('chat');
    try {
      const res = await api.support.getTicket(ticketId);
      setChatTicket(res.ticket);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (e: any) {
      setError(e.message || 'Failed to load ticket');
      setView('main');
    } finally {
      setChatLoading(false);
    }
  }, []);

  // Poll for new messages in chat view
  useEffect(() => {
    if (view !== 'chat' || !chatTicket) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.support.getTicket(chatTicket.id);
        setChatTicket(res.ticket);
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [view, chatTicket?.id]);

  async function handleSendReply() {
    if (!replyText.trim() || !chatTicket || sending) return;
    setSending(true);
    try {
      await api.support.replyToTicket(chatTicket.id, replyText.trim());
      setReplyText('');
      // Refresh messages
      const res = await api.support.getTicket(chatTicket.id);
      setChatTicket(res.ticket);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setError(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function handleBack() {
    if (view === 'main') {
      router.back();
    } else {
      setView('main');
      setChatTicket(null);
      setError(null);
      loadTickets();
    }
  }

  const headerTitle = view === 'create' ? 'NEW TICKET' : view === 'chat' ? (chatTicket?.ticketNumber || 'TICKET') : 'SUPPORT';

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={s.fill}>
      <SafeAreaView style={s.fill}>
        <KeyboardAvoidingView
          style={s.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Header */}
          <View style={s.header}>
            <BackButton onPress={handleBack} />
            <View style={s.headerCenter}>
              <Text style={s.headerTitle}>{headerTitle}</Text>
              {view === 'chat' && chatTicket && (
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[chatTicket.status]?.bg || 'rgba(255,255,255,0.1)' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[chatTicket.status]?.text || Colors.white }]}>
                    {chatTicket.status.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ width: 60 }} />
          </View>

          {view === 'main' && renderMain()}
          {view === 'create' && renderCreate()}
          {view === 'chat' && renderChat()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );

  function renderMain() {
    return (
      <ScrollView style={s.fill} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* FAQ Section */}
        <Text style={s.sectionTitle}>FAQ</Text>
        <View style={s.card}>
          {FAQ_ITEMS.map((item, i) => (
            <Pressable
              key={i}
              onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
              style={[s.faqItem, i < FAQ_ITEMS.length - 1 && s.faqBorder]}
            >
              <View style={s.faqHeader}>
                <Text style={s.faqQuestion}>{item.question}</Text>
                <Text style={s.faqArrow}>{expandedFaq === i ? '\u25B2' : '\u25BC'}</Text>
              </View>
              {expandedFaq === i && (
                <Text style={s.faqAnswer}>{item.answer}</Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* My Tickets Section */}
        {hasAuth && (
          <>
            <View style={s.ticketHeaderRow}>
              <Text style={s.sectionTitle}>MY TICKETS</Text>
              <Pressable style={s.newTicketBtn} onPress={() => { setError(null); setView('create'); }}>
                <Text style={s.newTicketText}>+ New Ticket</Text>
              </Pressable>
            </View>

            {loading && <ActivityIndicator color={Colors.yellow} style={{ marginTop: 20 }} />}

            {error && (
              <View style={[s.card, { alignItems: 'center', paddingVertical: 20 }]}>
                <Text style={s.errorText}>{error}</Text>
                <Pressable onPress={() => { setError(null); setLoading(true); loadTickets(); }} style={s.retryBtn}>
                  <Text style={s.retryText}>Retry</Text>
                </Pressable>
              </View>
            )}

            {!loading && !error && tickets.length === 0 && (
              <View style={[s.card, { alignItems: 'center', paddingVertical: 24 }]}>
                <Text style={{ fontFamily: Fonts.body, fontSize: 14, color: Colors.whiteAlpha50 }}>
                  No tickets yet. Tap "New Ticket" if you need help.
                </Text>
              </View>
            )}

            {tickets.map(t => (
              <Pressable key={t.id} style={s.ticketCard} onPress={() => openChat(t.id)}>
                <View style={s.ticketTop}>
                  <Text style={s.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                  {t.hasUnreadAdminReply && <View style={s.unreadDot} />}
                </View>
                <View style={s.ticketMeta}>
                  <View style={[s.categoryBadge, { backgroundColor: getCatColor(t.category).bg }]}>
                    <Text style={[s.categoryText, { color: getCatColor(t.category).text }]}>
                      {t.category.toUpperCase()}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[t.status]?.bg || 'rgba(255,255,255,0.1)' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLORS[t.status]?.text || Colors.white }]}>
                      {t.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={s.ticketTime}>{timeAgo(t.createdAt)}</Text>
                </View>
                {t.lastMessage && (
                  <Text style={s.ticketPreview} numberOfLines={1}>
                    {t.lastMessage.authorType === 'admin' ? 'Admin: ' : 'You: '}
                    {t.lastMessage.content}
                  </Text>
                )}
              </Pressable>
            ))}
          </>
        )}

        {hasAuth === false && (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 24, gap: 12 }]}>
            <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.white }}>
              Sign in to access support tickets
            </Text>
            <Pressable onPress={() => Linking.openURL('mailto:info@donkeyideas.com')}>
              <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: Colors.blueSky, textDecorationLine: 'underline' }}>
                Or email us at info@donkeyideas.com
              </Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderCreate() {
    return (
      <ScrollView style={s.fill} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={s.label}>Subject</Text>
        <TextInput
          style={s.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief description of your issue"
          placeholderTextColor={Colors.whiteAlpha25}
          maxLength={200}
        />

        <Text style={[s.label, { marginTop: 16 }]}>Category</Text>
        <View style={s.categoryRow}>
          {CATEGORIES.map(c => (
            <Pressable
              key={c.id}
              style={[s.categoryPill, category === c.id && { backgroundColor: c.color + '30', borderColor: c.color }]}
              onPress={() => setCategory(c.id)}
            >
              <Text style={[s.categoryPillText, category === c.id && { color: c.color }]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>Message</Text>
        <TextInput
          style={[s.input, s.textArea]}
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your issue in detail..."
          placeholderTextColor={Colors.whiteAlpha25}
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />

        {error && <Text style={[s.errorText, { marginTop: 12 }]}>{error}</Text>}

        <Pressable
          style={[s.submitBtn, (!subject.trim() || !message.trim()) && s.submitBtnDisabled]}
          onPress={handleCreateTicket}
          disabled={submitting || !subject.trim() || !message.trim()}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.ink} size="small" />
          ) : (
            <Text style={s.submitText}>SUBMIT TICKET</Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderChat() {
    if (chatLoading) {
      return (
        <View style={[s.fill, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator color={Colors.yellow} size="large" />
        </View>
      );
    }

    if (!chatTicket) return null;

    return (
      <>
        {/* Subject bar */}
        <View style={s.chatSubject}>
          <Text style={s.chatSubjectText} numberOfLines={1}>{chatTicket.subject}</Text>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.fill}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {chatTicket.messages.map(m => {
            const isPlayer = m.authorType === 'player';
            return (
              <View key={m.id} style={[s.bubble, isPlayer ? s.bubblePlayer : s.bubbleAdmin]}>
                <Text style={s.bubbleAuthor}>
                  {isPlayer ? 'You' : 'Admin'}
                </Text>
                <Text style={s.bubbleText}>{m.content}</Text>
                <Text style={s.bubbleTime}>{timeAgo(m.createdAt)}</Text>
              </View>
            );
          })}

          {chatTicket.status === 'resolved' && (
            <View style={s.resolvedBanner}>
              <Text style={s.resolvedText}>This ticket has been resolved</Text>
              {chatTicket.resolution && (
                <Text style={s.resolutionText}>{chatTicket.resolution}</Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* Reply input */}
        {chatTicket.status !== 'resolved' && (
          <View style={s.replyBar}>
            <TextInput
              style={s.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type a message..."
              placeholderTextColor={Colors.whiteAlpha25}
              maxLength={2000}
              multiline
            />
            <Pressable
              style={[s.sendBtn, !replyText.trim() && { opacity: 0.4 }]}
              onPress={handleSendReply}
              disabled={sending || !replyText.trim()}
            >
              {sending ? (
                <ActivityIndicator color={Colors.ink} size="small" />
              ) : (
                <Text style={s.sendText}>{'\u25B6'}</Text>
              )}
            </Pressable>
          </View>
        )}
      </>
    );
  }
}

function getCatColor(cat: string): { bg: string; text: string } {
  switch (cat) {
    case 'purchase': return { bg: 'rgba(255,194,32,0.15)', text: Colors.yellow };
    case 'bug': return { bg: 'rgba(77,128,255,0.15)', text: Colors.blueSky };
    case 'account': return { bg: 'rgba(155,89,182,0.15)', text: '#c39bd3' };
    case 'refund': return { bg: 'rgba(231,76,60,0.15)', text: Colors.red };
    default: return { bg: 'rgba(255,255,255,0.08)', text: Colors.whiteAlpha50 };
  }
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontFamily: Fonts.display, fontSize: 18, color: Colors.white },

  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.yellow,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 16,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },

  // FAQ
  faqItem: { paddingHorizontal: 14, paddingVertical: 12 },
  faqBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faqQuestion: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.white, flex: 1, marginRight: 8 },
  faqArrow: { fontSize: 10, color: Colors.whiteAlpha50 },
  faqAnswer: { fontFamily: Fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginTop: 8 },

  // Ticket list
  ticketHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  newTicketBtn: {
    backgroundColor: Colors.yellow,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
  },
  newTicketText: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.ink },

  ticketCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 10,
  },
  ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ticketSubject: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.white, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green, marginLeft: 8 },
  ticketMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ticketTime: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha40 },
  ticketPreview: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha50, marginTop: 6 },

  // Badges
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontFamily: Fonts.bodyBold, fontSize: 9, letterSpacing: 1 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  categoryText: { fontFamily: Fonts.bodyBold, fontSize: 9, letterSpacing: 1 },

  // Create form
  label: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.white, marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.white,
  },
  textArea: { height: 120, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  categoryPillText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.whiteAlpha50 },
  submitBtn: {
    backgroundColor: Colors.yellow,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontFamily: Fonts.display, fontSize: 16, color: Colors.ink, letterSpacing: 1 },

  // Error
  errorText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.red, textAlign: 'center' },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    marginTop: 10,
  },
  retryText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.white },

  // Chat
  chatSubject: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  chatSubjectText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: Colors.whiteAlpha50 },
  chatContent: { padding: Spacing.md, paddingBottom: 10 },
  bubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 10,
  },
  bubblePlayer: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(77,128,255,0.2)',
    borderBottomRightRadius: 4,
  },
  bubbleAdmin: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,194,32,0.15)',
    borderBottomLeftRadius: 4,
  },
  bubbleAuthor: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.whiteAlpha50, marginBottom: 4 },
  bubbleText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.white, lineHeight: 20 },
  bubbleTime: { fontFamily: Fonts.body, fontSize: 10, color: Colors.whiteAlpha25, marginTop: 4, textAlign: 'right' },

  resolvedBanner: {
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.2)',
    borderRadius: BorderRadius.md,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  resolvedText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.green },
  resolutionText: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 },

  // Reply bar
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,26,58,0.5)',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.white,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 14, color: Colors.ink },
});
