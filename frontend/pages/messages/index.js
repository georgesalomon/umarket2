import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  fetchChats,
  fetchChatMessages,
  fetchMessageReceipts,
  getPublicAvatarUrl,
  markMessagesRead,
  sendChatMessage,
  subscribeToChatMessages,
  unsubscribeFromChannel,
} from '../../utils/chatApi';
import { apiFetch } from '../../utils/apiClient';

const MAX_MESSAGES = 200;

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minutes');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hours');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, 'days');
  }
  const diffWeeks = Math.round(diffDays / 7);
  if (Math.abs(diffWeeks) < 4) {
    return formatter.format(diffWeeks, 'weeks');
  }
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return formatter.format(diffMonths, 'months');
  }
  const diffYears = Math.round(diffDays / 365);
  return formatter.format(diffYears, 'years');
}

function formatMessageTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getInitials(value) {
  if (!value) return 'U';
  const trimmed = String(value).trim();
  if (!trimmed) return 'U';
  const segments = trimmed.split(/\s+/);
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  const first = segments[0]?.[0] || '';
  const last = segments[segments.length - 1]?.[0] || '';
  const combo = `${first}${last}`.toUpperCase();
  return combo || 'U';
}

function sortChats(list) {
  return [...list].sort((a, b) => {
    const left = a.updatedAt || a.updated_at || a.createdAt || a.created_at;
    const right = b.updatedAt || b.updated_at || b.createdAt || b.created_at;
    return new Date(right).getTime() - new Date(left).getTime();
  });
}

function sortMessages(list) {
  return [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatError, setChatError] = useState(null);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messagesMap, setMessagesMap] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);
  const [profileCache, setProfileCache] = useState({});
  const profileCacheRef = useRef({});
  const messagesMapRef = useRef({});
  const messagesContainerRef = useRef(null);

  const queryChatId = router.query.chat ? String(router.query.chat) : null;

  useEffect(() => {
    if (queryChatId) {
      setSelectedChatId(queryChatId);
    }
  }, [queryChatId]);

  useEffect(() => {
    if (user) {
      const fullName = user.user_metadata?.full_name || user.email;
      const avatarPath = user.user_metadata?.avatar_path || null;
      const avatarUrl = avatarPath ? getPublicAvatarUrl(avatarPath) : null;
      const profileRecord = {
        id: user.id,
        full_name: fullName,
        email: user.email,
        avatar_path: avatarPath,
        avatar_url: avatarUrl,
      };
      profileCacheRef.current[user.id] = profileRecord;
      setProfileCache((prev) => ({ ...prev, [user.id]: profileRecord }));
    }
  }, [user]);

  const ensureProfiles = useCallback(async (ids) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) return;
    const missing = uniqueIds.filter((id) => !profileCacheRef.current[id]);
    if (!missing.length) return;

    try {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const profile = await apiFetch(`/users/${id}`);
            if (!profile) {
              return [id, null];
            }
            const avatarUrl =
              profile.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : profile.avatar_url || null;
            const normalized = {
              ...profile,
              avatar_url: avatarUrl,
            };
            return [id, normalized];
          } catch (error) {
            console.error('Failed to load profile', id, error);
            return [id, null];
          }
        }),
      );
      const entries = Object.fromEntries(results);
      profileCacheRef.current = { ...profileCacheRef.current, ...entries };
      setProfileCache((prev) => ({ ...prev, ...entries }));
    } catch (error) {
      console.error('Error ensuring profiles', error);
    }
  }, []);

  const decoratedChats = useMemo(() => {
    if (!user) return [];
    return sortChats(
      chats.map((chat) => {
        const counterpartId = chat.buyerId === user.id ? chat.sellerId : chat.buyerId;
        const counterpartProfile = counterpartId ? profileCache[counterpartId] : null;
        return {
          ...chat,
          counterpartId,
          counterpartProfile,
          isBuyer: chat.buyerId === user.id,
        };
      }),
    );
  }, [chats, profileCache, user]);

  const selectedChat = useMemo(
    () => decoratedChats.find((chat) => chat.id === selectedChatId) || null,
    [decoratedChats, selectedChatId],
  );

  useEffect(() => {
    messagesMapRef.current = messagesMap;
  }, [messagesMap]);

  const scrollMessagesToBottom = useCallback((behavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    }
  }, []);

  const markChatAsRead = useCallback(
    async (chatId, sourceMessages) => {
      if (!user || !chatId) return;
      const list = sourceMessages || messagesMapRef.current[chatId] || [];
      if (!list.length) return;
      const unreadMessages = list.filter((msg) => msg.sender_id !== user.id && !msg.read_at);
      if (!unreadMessages.length) return;
      const timestamp = new Date().toISOString();
      try {
        await markMessagesRead(
          unreadMessages.map((msg) => msg.id),
          user.id,
        );
      } catch (error) {
        console.error('Failed to mark messages read', error);
      }
      const updatedList = list.map((msg) =>
        unreadMessages.some((item) => item.id === msg.id)
          ? { ...msg, read_at: timestamp }
          : msg,
      );
      setMessagesMap((prev) => ({
        ...prev,
        [chatId]: updatedList,
      }));
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                lastMessageReadAt:
                  chat.lastMessage && unreadMessages.some((msg) => msg.id === chat.lastMessage.id)
                    ? timestamp
                    : chat.lastMessageReadAt,
              }
            : chat,
        ),
      );
    },
    [user],
  );

  const loadChats = useCallback(async () => {
    if (!user) return;
    setChatsLoading(true);
    setChatError(null);
    try {
      const data = await fetchChats(user.id);
      const messageIds = data
        .map((chat) => chat.lastMessage?.id)
        .filter(Boolean);
      const receipts = await fetchMessageReceipts(messageIds, user.id);
      const enriched = data.map((chat) => ({
        ...chat,
        lastMessageReadAt: chat.lastMessage ? receipts[chat.lastMessage.id] || null : null,
      }));
      setChats(enriched);
      const counterpartIds = enriched.map((chat) =>
        chat.buyerId === user.id ? chat.sellerId : chat.buyerId,
      );
      await ensureProfiles(counterpartIds);
      if (!queryChatId && enriched.length && !selectedChatId) {
        setSelectedChatId(enriched[0].id);
        router.replace(
          { pathname: '/messages', query: { chat: enriched[0].id } },
          undefined,
          { shallow: true },
        );
      }
    } catch (error) {
      console.error(error);
      setChatError(error.message || 'Unable to load conversations.');
    } finally {
      setChatsLoading(false);
    }
  }, [ensureProfiles, queryChatId, router, selectedChatId, user]);

  useEffect(() => {
    if (user) {
      loadChats();
    } else if (!authLoading) {
      setChats([]);
      setSelectedChatId(null);
      setMessagesMap({});
    }
  }, [authLoading, loadChats, user]);

  const loadMessages = useCallback(
    async (chatId) => {
      if (!user || !chatId) return;
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const data = await fetchChatMessages(chatId, { limit: MAX_MESSAGES });
        const receipts = await fetchMessageReceipts(
          data.map((message) => message.id),
          user.id,
        );
        const decorated = data.map((message) => ({
          ...message,
          read_at: receipts[message.id] || null,
        }));
        setMessagesMap((prev) => ({
          ...prev,
          [chatId]: decorated,
        }));
        const senderIds = decorated.map((message) => message.sender_id);
        await ensureProfiles(senderIds);
        await markChatAsRead(chatId, decorated);
        setMessagesError(null);
        scrollMessagesToBottom('auto');
      } catch (error) {
        console.error(error);
        setMessagesError(error.message || 'Failed to load messages.');
      } finally {
        setMessagesLoading(false);
      }
    },
    [ensureProfiles, markChatAsRead, scrollMessagesToBottom, user],
  );

  useEffect(() => {
    if (!selectedChatId || !user) return undefined;
    loadMessages(selectedChatId);
    const channel = subscribeToChatMessages(selectedChatId, (payload) => {
      const message = payload.new;
      if (!message) return;
      setChats((prev) => {
        const exists = prev.some((chat) => chat.id === message.chat_id);
        const next = exists
          ? prev.map((chat) =>
              chat.id === message.chat_id
                ? {
                    ...chat,
                    updatedAt: message.created_at,
                    lastMessage: {
                      id: message.id,
                      body: message.body,
                      sender_id: message.sender_id,
                      created_at: message.created_at,
                      edited_at: message.edited_at,
                    },
                  }
                : chat,
            )
          : [
              ...prev,
              {
                id: message.chat_id,
                productId: message.chat_id,
                buyerId: user.id,
                sellerId: null,
                createdAt: message.created_at,
                updatedAt: message.created_at,
                product: null,
                buyer: null,
                seller: null,
                lastMessage: {
                  id: message.id,
                  body: message.body,
                  sender_id: message.sender_id,
                  created_at: message.created_at,
                  edited_at: message.edited_at,
                },
                lastMessageReadAt: message.sender_id === user.id ? message.created_at : null,
              },
            ];
        return sortChats(next);
      });

      if (payload.eventType === 'DELETE') {
        setMessagesMap((prev) => {
          const list = prev[message.chat_id] || [];
          const filtered = list.filter((item) => item.id !== message.id);
          return { ...prev, [message.chat_id]: filtered };
        });
        return;
      }

      let nextList = null;
      const enriched = {
        ...message,
        read_at: message.sender_id === user.id ? message.created_at : null,
      };
      setMessagesMap((prev) => {
        const existing = prev[message.chat_id] || [];
        if (existing.some((item) => item.id === message.id)) {
          nextList = existing;
          return prev;
        }
        const merged = [...existing, enriched];
        nextList = merged;
        return {
          ...prev,
          [message.chat_id]: sortMessages(merged),
        };
      });
      ensureProfiles([message.sender_id]);

      if (message.sender_id === user.id && message.chat_id === selectedChatId) {
        const timestamp = message.created_at;
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === message.chat_id
              ? {
                  ...chat,
                  lastMessageReadAt: timestamp,
                }
              : chat,
          ),
        );
      } else if (message.chat_id === selectedChatId) {
        markChatAsRead(message.chat_id, nextList);
      }
      scrollMessagesToBottom('smooth');
    });

    return () => {
      unsubscribeFromChannel(channel);
    };
  }, [ensureProfiles, loadMessages, markChatAsRead, scrollMessagesToBottom, selectedChatId, user]);

  useEffect(() => {
    if (!selectedChatId) return;
    scrollMessagesToBottom('auto');
  }, [selectedChatId, scrollMessagesToBottom]);

  const handleSelectChat = useCallback(
    (chatId) => {
      setSelectedChatId(chatId);
      setMessagesError(null);
      router.replace(
        { pathname: '/messages', query: chatId ? { chat: chatId } : {} },
        undefined,
        { shallow: true },
      );
      const messages = messagesMap[chatId];
      if (messages?.length) {
        markChatAsRead(chatId, messages);
        scrollMessagesToBottom('auto');
      } else if (chatId) {
        loadMessages(chatId);
      }
    },
    [loadMessages, markChatAsRead, messagesMap, router, scrollMessagesToBottom],
  );

  const handleSendMessage = useCallback(
    async (event) => {
      event.preventDefault();
      if (!composerValue.trim() || !selectedChat || !user) return;
      const trimmed = composerValue.trim();
      setComposerValue('');
      setSending(true);
      const optimisticId = `optimistic-${Date.now()}`;
      const timestamp = new Date().toISOString();
      const optimisticMessage = {
        id: optimisticId,
        chat_id: selectedChat.id,
        sender_id: user.id,
        body: trimmed,
        created_at: timestamp,
        edited_at: null,
        deleted_at: null,
        read_at: timestamp,
        optimistic: true,
      };
      setMessagesMap((prev) => {
        const existing = prev[selectedChat.id] || [];
        return {
          ...prev,
          [selectedChat.id]: [...existing, optimisticMessage],
        };
      });
      setChats((prev) =>
        sortChats(
          prev.map((chat) =>
            chat.id === selectedChat.id
              ? {
                  ...chat,
                  lastMessage: {
                    id: optimisticId,
                    body: trimmed,
                    sender_id: user.id,
                    created_at: timestamp,
                    edited_at: null,
                  },
                  lastMessageReadAt: timestamp,
                  updatedAt: timestamp,
                }
              : chat,
          ),
        ),
      );
      scrollMessagesToBottom('smooth');

      try {
        const saved = await sendChatMessage(selectedChat.id, trimmed, user.id);
        const savedMessage = { ...saved, read_at: timestamp };
        setMessagesMap((prev) => {
          const existing = prev[selectedChat.id] || [];
          const replaced = existing.map((msg) =>
            msg.id === optimisticId ? savedMessage : msg,
          );
          const hasSaved = replaced.some((msg) => msg.id === savedMessage.id);
          const nextList = hasSaved
            ? replaced
            : [...replaced.filter((msg) => msg.id !== optimisticId), savedMessage];
          return {
            ...prev,
            [selectedChat.id]: sortMessages(nextList),
          };
        });
        setChats((prev) =>
          sortChats(
            prev.map((chat) =>
              chat.id === selectedChat.id
                ? {
                    ...chat,
                    lastMessage: { ...saved },
                    lastMessageReadAt: timestamp,
                    updatedAt: saved.created_at,
                  }
                : chat,
            ),
          ),
        );
      } catch (error) {
        console.error(error);
        setMessagesMap((prev) => {
          const existing = prev[selectedChat.id] || [];
          return {
            ...prev,
            [selectedChat.id]: existing.map((msg) =>
              msg.id === optimisticId ? { ...msg, sendError: error.message } : msg,
            ),
          };
        });
        setChatError(error.message || 'Failed to send message.');
      } finally {
        setSending(false);
      }
    },
    [composerValue, selectedChat, scrollMessagesToBottom, user],
  );

  const hasChats = decoratedChats.length > 0;
  const messagesForSelected = selectedChat ? messagesMap[selectedChat.id] || [] : [];
  const counterpartProfile = selectedChat?.counterpartProfile || null;
  const counterpartId = selectedChat?.counterpartId || counterpartProfile?.id || null;
  const counterpartName =
    counterpartProfile?.full_name || counterpartProfile?.email || 'Marketplace user';
  const counterpartAvatar = counterpartProfile?.avatar_url || null;
  const counterpartInitials = getInitials(counterpartName);
  const counterpartHeading = counterpartId ? (
    <Link href={`/users/${counterpartId}`} className="messages-thread__name-link">
      {counterpartName}
    </Link>
  ) : (
    counterpartName
  );
  const productName = selectedChat?.product?.name || 'Listing';

  if (authLoading) {
    return (
      <Layout>
        <div className="messages-page__empty">
          <p>Loading your messages…</p>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="messages-page__empty">
          <h1>Messages</h1>
          <p>Please sign in to view your conversations.</p>
          <Link href="/login" className="messages-page__cta">
            Go to login
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="messages-page">
        <header className="messages-page__header">
          <div>
            <h1>Messages</h1>
            <p>Chat with buyers and sellers in a clean, real-time inbox.</p>
          </div>
          <button
            type="button"
            className="messages-page__refresh"
            onClick={loadChats}
            disabled={chatsLoading}
          >
            Refresh
          </button>
        </header>
        <div className="messages-layout">
          <aside className="messages-sidebar">
            <div className="messages-sidebar__header">
              <h2>Conversations</h2>
              {chatsLoading && <span className="messages-sidebar__status">Loading…</span>}
              {chatError && <span className="messages-sidebar__status messages-sidebar__status--error">{chatError}</span>}
            </div>
            {hasChats ? (
              <ul className="messages-list">
                {decoratedChats.map((chat) => {
                  const name =
                    chat.counterpartProfile?.full_name ||
                    chat.counterpartProfile?.email ||
                    'Marketplace user';
                  const avatarUrl = chat.counterpartProfile?.avatar_url || null;
                  const initials = getInitials(name);
                  const lastMessage = chat.lastMessage;
                  const hasUnread =
                    !!lastMessage &&
                    lastMessage.sender_id !== user.id &&
                    !chat.lastMessageReadAt;
                  const snippet = lastMessage?.body || 'Start chatting…';
                  const timestamp = lastMessage?.created_at || chat.updatedAt;
                  const isActive = chat.id === selectedChatId;
                  return (
                    <li key={chat.id}>
                      <button
                        type="button"
                        className={`messages-list__item${isActive ? ' messages-list__item--active' : ''}`}
                        onClick={() => handleSelectChat(chat.id)}
                      >
                        <span className="messages-list__avatar">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={name} />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </span>
                        <span className="messages-list__body">
                          <span className="messages-list__name">{name}</span>
                          <span className="messages-list__preview">{snippet}</span>
                        </span>
                        <span className="messages-list__meta">
                          <time>{formatRelativeTime(timestamp)}</time>
                          {hasUnread && <span className="messages-list__unread-dot" aria-hidden="true" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="messages-sidebar__empty">
                <p>No conversations yet.</p>
                <p>Reach out from a listing to start chatting with a seller.</p>
              </div>
            )}
          </aside>
          <section className="messages-thread">
            {selectedChat ? (
              <>
                <header className="messages-thread__header">
                  <div className="messages-thread__profile">
                    <span className="messages-thread__avatar">
                      {counterpartAvatar ? (
                        <img src={counterpartAvatar} alt={counterpartName} />
                      ) : (
                        <span>{counterpartInitials}</span>
                      )}
                    </span>
                    <div>
                      <h2>{counterpartHeading}</h2>
                      <p>
                        Talking about{' '}
                        {selectedChat.product?.prod_id ? (
                          <Link href={`/items/${selectedChat.product.prod_id}`}>
                            {productName}
                          </Link>
                        ) : (
                          productName
                        )}
                      </p>
                    </div>
                  </div>
                  {selectedChat.product?.price != null && (
                    <div className="messages-thread__listing-meta">
                      <span>${Number(selectedChat.product.price).toFixed(2)}</span>
                    </div>
                  )}
                </header>
                <div className="messages-thread__messages" ref={messagesContainerRef}>
                  {messagesLoading && <p className="messages-thread__status">Loading messages…</p>}
                  {messagesError && (
                    <p className="messages-thread__status messages-thread__status--error">
                      {messagesError}
                    </p>
                  )}
                  {!messagesLoading && !messagesError && messagesForSelected.length === 0 && (
                    <div className="messages-thread__empty">
                      <p>Say hello! Start the conversation with a friendly message.</p>
                    </div>
                  )}
                  {messagesForSelected.map((message) => {
                    const senderProfile = profileCache[message.sender_id];
                    const senderName =
                      senderProfile?.full_name || senderProfile?.email || 'User';
                    const isMine = message.sender_id === user.id;
                    return (
                      <article
                        key={message.id}
                        className={`messages-thread__bubble${isMine ? ' messages-thread__bubble--own' : ''}`}
                      >
                        {!isMine && (
                          <span className="messages-thread__bubble-avatar">
                            {senderProfile?.avatar_url ? (
                              <img src={senderProfile.avatar_url} alt={senderName} />
                            ) : (
                              <span>{getInitials(senderName)}</span>
                            )}
                          </span>
                        )}
                        <div className="messages-thread__bubble-body">
                          <div className="messages-thread__bubble-content">
                            <p>{message.body}</p>
                          </div>
                          <footer>
                            <time>{formatMessageTimestamp(message.created_at)}</time>
                            {message.sendError && (
                              <span className="messages-thread__bubble-error">
                                Failed to send
                              </span>
                            )}
                            {message.edited_at && <span>Edited</span>}
                          </footer>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <form className="messages-composer" onSubmit={handleSendMessage}>
                  <textarea
                    value={composerValue}
                    onChange={(event) => setComposerValue(event.target.value)}
                    placeholder="Type your message…"
                    rows={2}
                    maxLength={2000}
                    disabled={sending}
                  />
                  <button type="submit" disabled={!composerValue.trim() || sending}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </form>
              </>
            ) : (
              <div className="messages-thread__placeholder">
                <h2>Select a conversation</h2>
                <p>
                  Choose a chat from the left to see messages, or open a listing and tap “Message
                  seller” to start a new conversation.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
    </Layout>
  );
}
