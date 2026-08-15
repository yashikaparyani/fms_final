import { useState, useEffect, useCallback } from "react";
import api from "../api";
import { useAutoRefresh } from "../hooks/useAutoRefresh";

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);
  const [page, setPage]                   = useState(1);
  const [hasMore, setHasMore]             = useState(true);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnreadCount(data.count);
    } catch {
      // silent — badge is non-critical
    }
  }, []);

  const fetchNotifications = useCallback(async (pageNum = 1, replace = false) => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications", {
        params: { page: pageNum, limit: 20 },
      });
      setNotifications((prev) =>
        replace ? data.notifications : [...prev, ...data.notifications]
      );
      setUnreadCount(data.unreadCount);
      setHasMore(pageNum < data.pagination.pages);
      setPage(pageNum);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) fetchNotifications(page + 1);
  }, [loading, hasMore, page, fetchNotifications]);

  useEffect(() => {
    fetchNotifications(1, true);
  }, [fetchNotifications]);

  // Only the badge count is polled — re-pulling the list would fight with the
  // pages the user has already scrolled through.
  useAutoRefresh(fetchUnreadCount);

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    refresh: () => fetchNotifications(1, true),
    markAsRead,
    markAllAsRead,
    deleteNotification,
    loadMore,
  };
};