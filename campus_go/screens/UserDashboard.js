// UserDashboard.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  Platform,
  LayoutAnimation,
  Animated,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import VisitorMap from "./VisitorMap";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * UserDashboard
 *
 * - Uses LayoutAnimation (no experimental Android call) for expand/collapse.
 * - Uses Animated.Value for arrow rotation.
 * - Preserves schedule add/edit, map, profile tabs.
 */

// NOTE: We intentionally do NOT call UIManager.setLayoutAnimationEnabledExperimental
// because on New Architecture it's a no-op and triggers the warning. LayoutAnimation
// still works for basic transitions.

export default function UserDashboard({ navigation, route }) {
  /* FAQ COLLAPSE STATES */
  const [faqOpen, setFaqOpen] = useState({
    addSchedule: false,
    viewMap: false,
    navigateBuildings: false,
  });

  // animated rotation values for arrows (0 -> closed, 1 -> open)
  const faqAnim = {
    addSchedule: useRef(new Animated.Value(0)).current,
    viewMap: useRef(new Animated.Value(0)).current,
    navigateBuildings: useRef(new Animated.Value(0)).current,
  };

  const animateArrow = (key, toValue) => {
    Animated.timing(faqAnim[key], {
      toValue,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const toggleFaq = (key) => {
    // Layout animation for expanding/collapsing content (safe without experimental call)
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {
      // In case any platform doesn't support, fallback silently
      // (this prevents runtime crashes)
    }

    setFaqOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // animate arrow
      animateArrow(key, next[key] ? 1 : 0);
      return next;
    });
  };

  const [activeTab, setActiveTab] = useState("home");
  const [schedule, setSchedule] = useState([]);

  // route user object (from Login)
  const user = route?.params?.user || {
    name: "Unknown",
    idNumber: "N/A",
    role: "Student",
    fullName: "Unknown User",
  };

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayClasses = schedule.filter((c) => c.day === today);

  /* ADD CLASS FORM */
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    day: "Monday",
    time: "",
    startTime: null,
    endTime: null,
    room: "",
    building: "",
    instructor: "",
  });

  // Time picker modal state (reused for start/end)
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState("start"); // "start" or "end"
  const [pickerHour, setPickerHour] = useState("8");
  const [pickerMinute, setPickerMinute] = useState("00");
  const [pickerAmPm, setPickerAmPm] = useState("AM");

 /* AsyncStorage helpers */
const saveSchedule = async (data) => {
  try {
    await AsyncStorage.setItem(`userSchedule_${user.idNumber}`, JSON.stringify(data));
  } catch (e) {
    console.log("Failed to save schedule", e);
  }
};

const loadSchedule = async () => {
  try {
    const stored = await AsyncStorage.getItem(`userSchedule_${user.idNumber}`);
    if (stored) {
      setSchedule(sortScheduleArray(JSON.parse(stored)));
    } else {
      setSchedule([]); // ensure new user starts with empty schedule
    }
  } catch (e) {
    console.log("Failed to load schedule", e);
    setSchedule([]);
  }
};

  useEffect(() => {
    loadSchedule();
  }, []);

  const addClass = () => {
    if (!form.subject.trim()) return;
    if (!isValidTimeRange(form.time)) {
      Alert.alert("Invalid time", "Please enter time like '8:00 AM - 9:30 AM'.");
      return;
    }
    if (!isTimeRangeLogical(form.time)) {
      Alert.alert("Invalid time range", "End time must be after start time (no overnight ranges).");
      return;
    }
    const newItem = { id: Date.now(), ...form };
    if (checkConflict(newItem)) {
      Alert.alert("Schedule conflict", "This class conflicts with an existing class on the same day and time.");
      return;
    }
    const updated = sortScheduleArray([newItem, ...schedule]);
    setSchedule(updated);
    saveSchedule(updated);
    setForm({
      subject: "",
      day: "Monday",
      time: "",
      room: "",
      building: "",
      instructor: "",
    });
    setModalVisible(false);
  };

  const removeClass = (id) => {
    const updated = sortScheduleArray(schedule.filter((x) => x.id !== id));
    setSchedule(updated);
    saveSchedule(updated);
  };
// Returns true if class `cls` conflicts with any other class on the same day
const checkConflict = (cls, ignoreId = null) => {
  return schedule.some(
    (other) =>
      other.id !== ignoreId &&
      other.day === cls.day &&
      isTimeOverlap(cls.time, other.time)
  );
};

// Helper to check if two time strings overlap, e.g. "8:00 AM - 9:30 AM"
const isTimeOverlap = (t1, t2) => {
  const parse = (str) => {
    const [h, m] = str.match(/\d+/g).map(Number);
    const ampm = str.includes("PM") ? 12 : 0;
    return h % 12 + ampm + m / 60;
  };
  const [s1, e1] = t1.split(" - ").map(parse);
  const [s2, e2] = t2.split(" - ").map(parse);
  return s1 < e2 && s2 < e1;
};

// Validate time range format like "8:00 AM - 9:30 AM"
const isValidTimeRange = (t) => {
  if (!t || typeof t !== "string") return false;
  const re = /^\s*\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)\s*$/i;
  return re.test(t);
};

// Ensure end time is strictly after start time (no overnight classes allowed)
const isTimeRangeLogical = (t) => {
  try {
    const parse = (str) => {
      const [h, m] = str.match(/\d+/g).map(Number);
      const ampm = str.toUpperCase().includes("PM") ? 12 : 0;
      return (h % 12) + ampm + m / 60;
    };
    const parts = t.split(" - ");
    if (parts.length !== 2) return false;
    const s = parse(parts[0]);
    const e = parse(parts[1]);
    return e > s;
  } catch (e) {
    return false;
  }
};

// Helpers to sort schedule by day (Mon-Fri) then start time
const DAY_INDEX = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
const parseStartHour = (t) => {
  try {
    const part = (t || "").split(" - ")[0] || "";
    const nums = part.match(/\d+/g);
    if (!nums) return 999;
    const [h, m] = nums.map(Number);
    const isPM = /PM/i.test(part);
    const hour = (h % 12) + (isPM ? 12 : 0) + (m || 0) / 60;
    return hour;
  } catch {
    return 999;
  }
};

const sortScheduleArray = (arr) => {
  return (arr || []).slice().sort((a, b) => {
    const da = DAY_INDEX[a.day] || 99;
    const db = DAY_INDEX[b.day] || 99;
    if (da !== db) return da - db;
    const ta = parseStartHour(a.time);
    const tb = parseStartHour(b.time);
    return ta - tb;
  });
};

// Return ordered days: days with classes ordered by earliest start, then remaining weekdays
const getOrderedDays = (sched) => {
  // Return a stable, predictable weekday ordering (Mon → Fri).
  // The UI expects the days to appear in natural weekday order rather than
  // being re-ordered by earliest class time.
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
};

  /* EDIT CLASS */
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    subject: "",
    day: "Monday",
    time: "",
    startTime: null,
    endTime: null,
    room: "",
    building: "",
    instructor: "",
  });

  // Reuse pickers for edit modal when opening
  const openTimePicker = (target, initial) => {
    setTimePickerTarget(target);
    // initial is a string like "8:00 AM" or null
    if (initial) {
      const m = (initial || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (m) {
        setPickerHour(String(Number(m[1])));
        setPickerMinute(m[2]);
        setPickerAmPm(m[3].toUpperCase());
      }
    }
    setTimePickerVisible(true);
  };

  const formatTimeParts = (h, m, ap) => {
    const hh = String(Number(h));
    const mm = (m || "").padStart(2, "0");
    return `${hh}:${mm} ${ap}`;
  };

  const applyPickedTimeToForm = () => {
    const formatted = formatTimeParts(pickerHour, pickerMinute, pickerAmPm);
    if (timePickerTarget === "start") {
      if (editModalVisible) {
        setEditForm((f) => ({ ...f, startTime: formatted, time: `${formatted} - ${f.endTime || ""}` }));
      } else {
        setForm((f) => ({ ...f, startTime: formatted, time: `${formatted} - ${f.endTime || ""}` }));
      }
    } else {
      if (editModalVisible) {
        setEditForm((f) => ({ ...f, endTime: formatted, time: `${f.startTime || ""} - ${formatted}` }));
      } else {
        setForm((f) => ({ ...f, endTime: formatted, time: `${f.startTime || ""} - ${formatted}` }));
      }
    }
    setTimePickerVisible(false);
  };

  const openEditModal = (item) => {
    const parts = (item.time || "").split(" - ");
    setEditItem(item);
    setEditForm({
      subject: item.subject,
      day: item.day,
      time: item.time,
      startTime: parts[0] || null,
      endTime: parts[1] || null,
      room: item.room,
      building: item.building,
      instructor: item.instructor,
    });
    setEditModalVisible(true);
  };

  const saveEdit = () => {
    if (!editForm.subject.trim()) return;
    if (!isValidTimeRange(editForm.time)) {
      Alert.alert("Invalid time", "Please enter time like '8:00 AM - 9:30 AM'.");
      return;
    }
    if (!isTimeRangeLogical(editForm.time)) {
      Alert.alert("Invalid time range", "End time must be after start time (no overnight ranges).");
      return;
    }
    // check conflicts ignoring the item being edited
    const candidate = { id: editItem.id, ...editForm };
    if (checkConflict(candidate, editItem.id)) {
      Alert.alert("Schedule conflict", "Edited class conflicts with another class on the same day and time.");
      return;
    }
    const updated = schedule.map((cls) =>
      cls.id === editItem.id ? { ...cls, ...editForm } : cls
    );
    const sorted = sortScheduleArray(updated);
    setSchedule(sorted);
    saveSchedule(sorted);
    setEditModalVisible(false);
    setEditItem(null);
  };

  /* RENDER PAGES */
  const renderContent = () => {
    switch (activeTab) {
      /* HOME */
      case "home":
        return (
          <ScrollView style={{ flex: 1 }}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Welcome back,</Text>
              <Text style={styles.username}>{user.fullName}</Text>

              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>Current Status</Text>
                <Text style={styles.statusValue}>
                  {user.role} • {user.idNumber}
                </Text>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.quickCard}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>

              <View style={styles.quickRow}>
                <TouchableOpacity
                  style={styles.quickItem}
                  onPress={() => setModalVisible(true)}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={32}
                    color="#4A60FF"
                  />
                  <Text style={styles.quickText}>Add Class</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickItem}
                  onPress={() => setActiveTab("map")}
                >
                  <Ionicons name="map-outline" size={32} color="#4CAF50" />
                  <Text style={styles.quickText}>View Map</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickItem}
                  onPress={() => setActiveTab("schedule")}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={32}
                    color="#B37BFF"
                  />
                  <Text style={styles.quickText}>Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Today Classes */}
            <View style={styles.classesBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Today's Classes</Text>
                <Text style={styles.dateText}>
                  {new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>

              {todayClasses.length === 0 ? (
                <View style={styles.noClassBox}>
                  <Ionicons name="calendar-outline" size={40} color="#bbb" />
                  <Text style={styles.noClassText}>
                    No classes scheduled today
                  </Text>
                </View>
              ) : (
                todayClasses.map((c) => (
                  <View key={c.id} style={styles.classCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.classTitle}>{c.subject}</Text>
                      <Text style={styles.classTime}>
                        {c.time.split(" - ")[0]}
                      </Text>
                    </View>

                    <Text style={styles.instructor}>{c.instructor}</Text>

                    <View style={styles.infoRow}>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color="#666"
                      />
                      <Text style={styles.infoText}>{c.time}</Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color="#666"
                      />
                      <Text style={styles.infoText}>
                        {c.room} • {c.building}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Stats */}
            <View style={styles.statsRowContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{schedule.length}</Text>
                <Text style={styles.statLabel}>Total Classes</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statNumber}>
                  {schedule.filter((s) => s.day === today).length}
                </Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
            </View>
          </ScrollView>
        );

      /* SCHEDULE */
case "schedule":
  return (
    <ScrollView style={styles.scheduleTab}>
      <View style={styles.scheduleTopCard}>
        <View>
          <Text style={styles.scheduleTopTitle}>My Schedule</Text>
          <Text style={styles.scheduleTopSubtitle}>
            {schedule.length} classes this semester
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Loop through Monday to Friday */}
      { getOrderedDays(schedule).map(
        (day) => {
          const filtered = sortScheduleArray(schedule).filter((c) => c.day === day);

          // If no classes on this day, still show the day label
          return (
            <View key={day} style={styles.dayGroup}>
              <Text style={styles.dayLabel}>{day}</Text>

              {filtered.length === 0 ? (
                <Text style={{ color: "#777", marginLeft: 12 }}>
                  No classes
                </Text>
              ) : (
                filtered.map((c) => {
                        const hasConflict = checkConflict(c, c.id);

                        return (
                          <View
                            key={c.id}
                            style={[
                              styles.scheduleCard,
                              hasConflict && {
                                borderColor: "#FF5A5A",
                                borderWidth: 2,
                              },
                            ]}
                          >
                            <View style={styles.rowBetween}>
                              <Text style={styles.subject}>{c.subject}</Text>
                              <View style={{ flexDirection: "row", gap: 12 }}>
                                <TouchableOpacity onPress={() => openEditModal(c)}>
                                  <Ionicons
                                    name="create-outline"
                                    size={20}
                                    color="#1A73E8"
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => removeClass(c.id)}>
                                  <Ionicons
                                    name="trash-outline"
                                    size={20}
                                    color="#D9534F"
                                  />
                                </TouchableOpacity>
                              </View>
                            </View>

                            <View style={styles.infoRow}>
                              <Ionicons name="time-outline" size={18} color="#555" />
                              <Text style={styles.infoText}>{c.time}</Text>
                            </View>

                            <View style={styles.infoRow}>
                              <Ionicons name="location-outline" size={18} color="#555" />
                              <Text style={styles.infoText}>
                                {c.room} • {c.building}
                              </Text>
                            </View>

                            <View style={styles.infoRow}>
                              <Ionicons name="person-outline" size={18} color="#555" />
                              <Text style={styles.infoText}>{c.instructor}</Text>
                            </View>

                            {hasConflict && (
                              <Text
                                style={{
                                  color: "#FF5A5A",
                                  marginTop: 6,
                                  fontWeight: "700",
                                }}
                              >
                                ⚠️ Conflicts with another class!
                              </Text>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              }
            )}
          </ScrollView>
        );

      /* MAP */
      case "map":
        return (
          <View style={{ flex: 1 }}>
            <VisitorMap navigation={navigation} />
          </View>
        );

      /* PROFILE PAGE - UPGRADED UI */
      case "profile":
        return (
          <ScrollView contentContainerStyle={styles.profileContainer}>
            {/* Gradient header */}
            <LinearGradient
              colors={["#4A60FF", "#6A85FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.profileHeader}
            >
              <Text style={styles.profileHeaderName}>{user.fullName}</Text>
              <Text style={styles.profileHeaderSub}>
                {user.role} • {user.idNumber}
              </Text>
            </LinearGradient>

            {/* Avatar floating */}
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person-circle-outline" size={96} color="#4A60FF" />
              </View>
            </View>

            {/* Card */}
            <View style={styles.profileCardElevated}>
              <Text style={styles.sectionTitleCard}>Help & Support</Text>

              {/* FAQ item - Add Schedule */}
              <TouchableOpacity
                style={styles.faqRow}
                onPress={() => toggleFaq("addSchedule")}
                activeOpacity={0.8}
              >
                <View style={styles.faqLeft}>
                  <Ionicons name="calendar-outline" size={20} color="#334155" />
                  <Text style={styles.faqTitle}>How to add schedule</Text>
                </View>

                <Animated.View
                  style={{
                    transform: [
                      {
                        rotate: faqAnim.addSchedule.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", "180deg"],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-down-outline" size={20} color="#334155" />
                </Animated.View>
              </TouchableOpacity>

              {faqOpen.addSchedule && (
                <View style={styles.faqContent}>
                  <Text style={styles.answerText}>
                    1. Open the Schedule tab {"\n"}
                    2. Tap the + Add button {"\n"}
                    3. Fill in subject, day, time, room, and building {"\n"}
                    4. Press Save
                  </Text>
                </View>
              )}

              {/* FAQ item - View Map */}
              <TouchableOpacity
                style={styles.faqRow}
                onPress={() => toggleFaq("viewMap")}
                activeOpacity={0.8}
              >
                <View style={styles.faqLeft}>
                  <Ionicons name="map-outline" size={20} color="#334155" />
                  <Text style={styles.faqTitle}>How to view map</Text>
                </View>

                <Animated.View
                  style={{
                    transform: [
                      {
                        rotate: faqAnim.viewMap.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", "180deg"],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-down-outline" size={20} color="#334155" />
                </Animated.View>
              </TouchableOpacity>

              {faqOpen.viewMap && (
                <View style={styles.faqContent}>
                  <Text style={styles.answerText}>
                    1. Open the Map tab {"\n"}
                    2. drag to pan {"\n"}
                    3. Tap any building marker to view details
                  </Text>
                </View>
              )}

              {/* FAQ item - Navigate Buildings */}
              <TouchableOpacity
                style={styles.faqRow}
                onPress={() => toggleFaq("navigateBuildings")}
                activeOpacity={0.8}
              >
                <View style={styles.faqLeft}>
                  <Ionicons name="business-outline" size={20} color="#334155" />
                  <Text style={styles.faqTitle}>How to navigate buildings</Text>
                </View>

                <Animated.View
                  style={{
                    transform: [
                      {
                        rotate: faqAnim.navigateBuildings.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", "180deg"],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-down-outline" size={20} color="#334155" />
                </Animated.View>
              </TouchableOpacity>

              {faqOpen.navigateBuildings && (
                <View style={styles.faqContent}>
                  <Text style={styles.answerText}>
                    1. Tap a building on the map {"\n"}
                    2. View floor plans (if available) {"\n"}
                    3. Follow highlighted path or use the map legend
                  </Text>
                </View>
              )}

              {/* Settings / extra */}
              <TouchableOpacity
                style={[styles.menuItem, { marginTop: 12 }]}
                onPress={() => navigation.navigate("PrivacySecurity")}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color="#334155" />
                <Text style={styles.menuText}>Privacy & Security</Text>
              </TouchableOpacity>

              <TouchableOpacity
  style={[styles.logoutBtn, { marginTop: 18 }]}
  onPress={async () => {
    await AsyncStorage.removeItem("loggedUser"); // <-- clear logged user
    navigation.replace("Login");
  }}
>
  <Text style={styles.logoutText}>Logout</Text>
</TouchableOpacity>

            </View>
          </ScrollView>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderContent()}

      {/* ADD CLASS MODAL */}
      <Modal
        transparent
        visible={modalVisible}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add New Class</Text>

            <TextInput
              placeholder="e.g. Data Structures"
              style={styles.input}
              value={form.subject}
              onChangeText={(t) => setForm((f) => ({ ...f, subject: t }))}
            />

            <View style={[styles.input, { padding: 0, justifyContent: "center" }]}>
  <Picker
    selectedValue={form.day}
    onValueChange={(t) => setForm((f) => ({ ...f, day: t }))}
    style={{ height: 50 }}
  >
    <Picker.Item label="Monday" value="Monday" />
    <Picker.Item label="Tuesday" value="Tuesday" />
    <Picker.Item label="Wednesday" value="Wednesday" />
    <Picker.Item label="Thursday" value="Thursday" />
    <Picker.Item label="Friday" value="Friday" />
  </Picker>
</View>


            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.input, { flex: 1, justifyContent: "center" }]}
                onPress={() => openTimePicker("start", form.startTime || null)}
              >
                <Text style={{ color: form.startTime ? "#111" : "#888" }}>
                  {form.startTime || "Start time"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.input, { flex: 1, justifyContent: "center" }]}
                onPress={() => openTimePicker("end", form.endTime || null)}
              >
                <Text style={{ color: form.endTime ? "#111" : "#888" }}>
                  {form.endTime || "End time"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Time picker modal (shared) */}
            <Modal transparent visible={timePickerVisible} animationType="fade">
              <View style={styles.modalBackdrop}>
                <View style={[styles.modalCard, { maxWidth: 360, width: "92%" }]}>
                  <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Pick Time</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Picker selectedValue={pickerHour} onValueChange={(v) => setPickerHour(v)}>
                        {Array.from({ length: 12 }).map((_, i) => {
                          const h = String(i + 1);
                          return <Picker.Item key={h} label={h} value={h} />;
                        })}
                      </Picker>
                    </View>

                    <View style={{ width: 100 }}>
                      <Picker selectedValue={pickerMinute} onValueChange={(v) => setPickerMinute(v)}>
                        {Array.from({ length: 60 }).map((_, i) => {
                          const m = String(i).padStart(2, "0");
                          return <Picker.Item key={m} label={m} value={m} />;
                        })}
                      </Picker>
                    </View>

                    <View style={{ width: 100 }}>
                      <Picker selectedValue={pickerAmPm} onValueChange={(v) => setPickerAmPm(v)}>
                        <Picker.Item label="AM" value="AM" />
                        <Picker.Item label="PM" value="PM" />
                      </Picker>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
                    <TouchableOpacity onPress={() => setTimePickerVisible(false)} style={{ marginRight: 12 }}>
                      <Text style={{ color: "#666" }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={applyPickedTimeToForm}>
                      <Text style={{ color: "#1faa59", fontWeight: "700" }}>Set</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            <TextInput
              placeholder="e.g. D3"
              style={styles.input}
              value={form.room}
              onChangeText={(t) => setForm((f) => ({ ...f, room: t }))}
            />

            <TextInput
              placeholder="e.g. Technology Building"
              style={styles.input}
              value={form.building}
              onChangeText={(t) => setForm((f) => ({ ...f, building: t }))}
            />

            <TextInput
              placeholder="e.g. Prof. Smith"
              style={styles.input}
              value={form.instructor}
              onChangeText={(t) => setForm((f) => ({ ...f, instructor: t }))}
            />

            <TouchableOpacity style={styles.addClassBtn} onPress={addClass}>
              <Text style={styles.addClassBtnText}>Add Class</Text>
            </TouchableOpacity>

            <Pressable style={styles.modalClose} onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={18} color="#333" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* EDIT CLASS */}
      <Modal
        transparent
        visible={editModalVisible}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Class</Text>

            <TextInput
              style={styles.input}
              placeholder="Subject"
              value={editForm.subject}
              onChangeText={(t) => setEditForm((f) => ({ ...f, subject: t }))}
            />

            <TextInput
              style={styles.input}
              placeholder="Day"
              value={editForm.day}
              onChangeText={(t) => setEditForm((f) => ({ ...f, day: t }))}
            />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.input, { flex: 1, justifyContent: "center" }]}
                onPress={() => openTimePicker("start", editForm.startTime || (editForm.time ? editForm.time.split(" - ")[0] : null))}
              >
                <Text style={{ color: editForm.startTime ? "#111" : "#888" }}>
                  {editForm.startTime || (editForm.time ? editForm.time.split(" - ")[0] : "Start time")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.input, { flex: 1, justifyContent: "center" }]}
                onPress={() => openTimePicker("end", editForm.endTime || (editForm.time ? editForm.time.split(" - ")[1] : null))}
              >
                <Text style={{ color: editForm.endTime ? "#111" : "#888" }}>
                  {editForm.endTime || (editForm.time ? (editForm.time.split(" - ")[1] || "End time") : "End time")}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Room"
              value={editForm.room}
              onChangeText={(t) => setEditForm((f) => ({ ...f, room: t }))}
            />

            <TextInput
              style={styles.input}
              placeholder="Building"
              value={editForm.building}
              onChangeText={(t) => setEditForm((f) => ({ ...f, building: t }))}
            />

            <TextInput
              style={styles.input}
              placeholder="Instructor"
              value={editForm.instructor}
              onChangeText={(t) => setEditForm((f) => ({ ...f, instructor: t }))}
            />

            <TouchableOpacity style={styles.addClassBtn} onPress={saveEdit}>
              <Text style={styles.addClassBtnText}>Save Changes</Text>
            </TouchableOpacity>

            <Pressable style={styles.modalClose} onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={18} color="#333" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* BOTTOM NAV */}
      <View style={styles.bottomNav}>
        {["home", "schedule", "map", "profile"].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={styles.navItem}
            onPress={() => setActiveTab(tab)}
          >
            <Ionicons
              name={
                tab === "home"
                  ? "home-outline"
                  : tab === "schedule"
                  ? "calendar-outline"
                  : tab === "map"
                  ? "map-outline"
                  : "person-outline"
              }
              size={26}
              color={activeTab === tab ? "#4A60FF" : "#9A9A9A"}
            />
            <Text style={activeTab === tab ? styles.navLabelActive : styles.navLabel}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

/* STYLES */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6FA" },

  header: {
    backgroundColor: "#4A60FF",
    padding: 24,
    paddingBottom: 56,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  welcome: { color: "white", fontSize: 16, opacity: 0.95 },
  username: {
    color: "white",
    fontSize: 26,
    fontWeight: "700",
    marginTop: 6,
  },
  statusBox: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    padding: 12,
    borderRadius: 12,
    width: "62%",
  },
  statusLabel: { color: "white", opacity: 0.9 },
  statusValue: { color: "white", fontSize: 15, fontWeight: "600", marginTop: 4 },

  quickCard: {
    backgroundColor: "white",
    marginTop: -36,
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 18,
    elevation: 3,
  },

  sectionTitle: { fontSize: 16, fontWeight: "700" },

  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  quickItem: { alignItems: "center", width: "30%" },
  quickText: { marginTop: 6, fontSize: 12, color: "#333" },

  classesBox: { marginTop: 18, marginHorizontal: 16 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  dateText: { color: "gray" },

  classCard: {
    marginTop: 10,
    backgroundColor: "white",
    padding: 16,
    borderRadius: 14,
    elevation: 2,
  },
  classTitle: { fontSize: 16, fontWeight: "700" },
  classTime: { color: "#4A60FF", fontWeight: "600" },
  instructor: { marginTop: 6, color: "#555" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  infoText: { marginLeft: 8, color: "#555" },

  noClassBox: { alignItems: "center", marginTop: 20 },
  noClassText: { color: "#777", marginTop: 8 },

  statsRowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 20,
  },
  statCard: {
    backgroundColor: "white",
    width: "48%",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    elevation: 2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: "#4A60FF",
  },
  statLabel: { color: "#666", marginTop: 6 },

  scheduleTab: { padding: 16 },

  scheduleTopCard: {
    backgroundColor: "#1A4DDE",
    padding: 20,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    marginTop: 30,
  },
  scheduleTopTitle: { color: "white", fontSize: 18, fontWeight: "700" },
  scheduleTopSubtitle: { color: "#E0E6FF", marginTop: 6 },
  addBtn: {
    backgroundColor: "#0F3CBD",
    padding: 10,
    borderRadius: 999,
  },

  dayGroup: { marginBottom: 18 },

  dayLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#555",
    marginBottom: 10,
  },

  scheduleCard: {
    backgroundColor: "white",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    elevation: 1,
  },
  subject: { fontSize: 16, fontWeight: "700", color: "#222" },

  /* PROFILE UPGRADE STYLES */
  profileContainer: { paddingBottom: 40, backgroundColor: "#F4F6FA" },

  profileHeader: {
    width: "100%",
    paddingVertical: 70,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  profileHeaderName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  profileHeaderSub: {
    color: "#E8ECFF",
    textAlign: "center",
    marginTop: 6,
  },

  avatarWrap: {
    alignItems: "center",
    marginTop: -48,
    marginBottom: 8,
  },
  avatarCircle: {
    backgroundColor: "white",
    padding: 6,
    borderRadius: 80,
    elevation: 6,
  },

  profileCardElevated: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 16,
    elevation: 3,
  },

  sectionTitleCard: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },

  faqRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomColor: "#F1F5F9",
    borderBottomWidth: 1,
  },
  faqLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  faqTitle: { marginLeft: 10, fontSize: 15, color: "#0f172a" },
  faqContent: { paddingVertical: 10 },

  answerText: {
    backgroundColor: "#F8FAFF",
    padding: 12,
    borderRadius: 10,
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20,
  },

  profileCard: {
    width: "100%",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    elevation: 1,
  },

  profileSection: {
    fontSize: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },

  logoutBtn: {
    backgroundColor: "#FF5A5A",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 12,
    alignItems: "center",
  },
  logoutText: { color: "white", fontWeight: "700" },

  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "white",
    paddingVertical: 12,
    borderRadius: 25,
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    elevation: 5,
  },
  navItem: { alignItems: "center", flex: 1 },
  navLabel: { fontSize: 12, color: "#999", marginTop: 4 },
  navLabelActive: { fontSize: 12, color: "#4A60FF", marginTop: 4 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: Platform.OS === "web" ? "40%" : "90%",
    backgroundColor: "white",
    padding: 18,
    borderRadius: 12,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 14,
    marginTop: 8,
    borderRadius: 10,
  },
  menuText: {
    marginLeft: 10,
    fontSize: 15,
    color: "#333",
  },

  input: {
    backgroundColor: "#F6F7FB",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ECECF2",
  },

  addClassBtn: {
    backgroundColor: "#0B1020",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 6,
  },
  addClassBtnText: { color: "white", fontWeight: "700" },
  modalClose: { position: "absolute", top: 10, right: 10 },
});
