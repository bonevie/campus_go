// notifications.js
// Shared helper to schedule/cancel weekly reminders using expo-notifications
import AsyncStorage from "@react-native-async-storage/async-storage";

const WEEKDAY_EXPO = { Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7 };

function parseStartParts(t) {
  try {
    const part = (t || "").split(" - ")[0] || "";
    const m = part.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return { hour: h, minute: min };
  } catch (e) {
    return null;
  }
}

export async function scheduleUserReminders(userId, sched) {
  try {
    const Notifications = require('expo-notifications');
    const perm = await Notifications.getPermissionsAsync?.();
    let status = perm && perm.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync?.();
      status = req && req.status;
      if (status !== 'granted') return;
    }

    // cancel any existing scheduled notifications for this user
    try {
      const existingStr = await AsyncStorage.getItem(`userNotifIds_${userId}`);
      const existing = existingStr ? JSON.parse(existingStr) : [];
      for (const id of existing) {
        try { await Notifications.cancelScheduledNotificationAsync(id); } catch (e) {}
      }
    } catch (e) {}

    const newIds = [];
    // read user's preferred lead time (per-user or global fallback)
    let advanceMins = 10;
    try {
      const per = await AsyncStorage.getItem(`reminderLead_${userId}`);
      if (per) advanceMins = Number(per) || advanceMins;
      else {
        const g = await AsyncStorage.getItem('reminderLeadMins');
        if (g) advanceMins = Number(g) || advanceMins;
      }
    } catch (e) {}

    for (const cls of (sched || [])) {
      try {
        if (!cls || !cls.time || !cls.day) continue;
        const parts = parseStartParts(cls.time);
        if (!parts) continue;
        const startTotal = parts.hour * 60 + parts.minute;
        const targetTotal = startTotal - advanceMins;
        let dayOffset = 0;
        let adjusted = targetTotal;
        if (targetTotal < 0) { adjusted = targetTotal + 24 * 60; dayOffset = -1; }
        else if (targetTotal >= 24 * 60) { adjusted = targetTotal - 24 * 60; dayOffset = 1; }
        const targetHour = Math.floor(adjusted / 60);
        const targetMinute = adjusted % 60;
        let expoWeekday = WEEKDAY_EXPO[cls.day];
        if (!expoWeekday) continue;
        expoWeekday = ((expoWeekday - 1 + dayOffset + 7) % 7) + 1; // wrap 1..7

        const contentTitle = cls.subject ? `Upcoming: ${cls.subject}` : `Upcoming class`;
        const contentBody = `${cls.subject || ''} at ${cls.time || ''}${cls.building ? ' • ' + cls.building : ''}${cls.room ? ' • ' + cls.room : ''}`.trim();

        const id = await Notifications.scheduleNotificationAsync({
          content: { title: contentTitle, body: contentBody, data: { type: 'schedule', classId: cls.id } },
          trigger: { weekday: expoWeekday, hour: targetHour, minute: targetMinute, repeats: true },
        });
        if (id) newIds.push(id);
      } catch (e) {
        // ignore per-class scheduling errors
      }
    }
    try { await AsyncStorage.setItem(`userNotifIds_${userId}`, JSON.stringify(newIds)); } catch (e) {}
  } catch (e) {
    console.log('scheduleUserReminders error', e);
  }
}

export async function cancelUserReminders(userId) {
  try {
    const Notifications = require('expo-notifications');
    const existingStr = await AsyncStorage.getItem(`userNotifIds_${userId}`);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    for (const id of existing) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch (e) {}
    }
    await AsyncStorage.removeItem(`userNotifIds_${userId}`);
  } catch (e) {}
}
