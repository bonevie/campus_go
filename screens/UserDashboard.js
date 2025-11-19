// UserDashboard.js
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import VisitorMap from "./VisitorMap";

// NOTE: If you prefer a native picker dropdown, install @react-native-picker/picker
// and replace the Day TextInput with a Picker component.

export default function UserDashboard({ navigation }) {
  const [activeTab, setActiveTab] = useState("home");

  const [schedule, setSchedule] = useState([
    { id: 1, day: "Monday", subject: "Web Development", time: "10:00 AM - 11:30 AM", room: "B2", building: "IT Building", instructor: "Prof. Garcia" },
    { id: 2, day: "Monday", subject: "Data Structures", time: "8:00 AM - 9:30 AM", room: "D3", building: "Technology Building", instructor: "Prof. Smith" },
    { id: 3, day: "Tuesday", subject: "Mobile App Development", time: "1:00 PM - 2:30 PM", room: "C5", building: "Technology Building", instructor: "Prof. Santos" },
  ]);

  const user = {
    name: "John Doe",
    idNumber: "2024-001",
    role: "Student",
  };

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayClasses = schedule.filter((c) => c.day === today);

  /* MAIN: Add Class Modal state */
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ subject: "", day: "Monday", time: "", room: "", building: "", instructor: "" });

  const addClass = () => {
    if (!form.subject.trim()) return; // minimal validation
    const newItem = { id: Date.now(), ...form };
    setSchedule((s) => [newItem, ...s]);
    setForm({ subject: "", day: "Monday", time: "", room: "", building: "", instructor: "" });
    setModalVisible(false);
  };

  const removeClass = (id) => {
    setSchedule((s) => s.filter((x) => x.id !== id));
  };

  /* EDIT CLASS state + handlers */
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    subject: "",
    day: "Monday",
    time: "",
    room: "",
    building: "",
    instructor: "",
  });

  const openEditModal = (item) => {
    setEditItem(item);
    setEditForm({
      subject: item.subject,
      day: item.day,
      time: item.time,
      room: item.room,
      building: item.building,
      instructor: item.instructor,
    });
    setEditModalVisible(true);
  };

  const saveEdit = () => {
    if (!editForm.subject.trim()) return;
    const updated = schedule.map((cls) =>
      cls.id === editItem.id ? { ...cls, ...editForm } : cls
    );
    setSchedule(updated);
    setEditModalVisible(false);
    setEditItem(null);
  };

  /* RENDER SWITCH */
  const renderContent = () => {
    switch (activeTab) {
      // ---------------- HOME ----------------
      case "home":
        return (
          <ScrollView style={{ flex: 1 }}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Welcome back,</Text>
              <Text style={styles.username}>{user.name}</Text>

              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>Current Status</Text>
                <Text style={styles.statusValue}>
                  {user.role} • {user.idNumber}
                </Text>
              </View>
            </View>

            <View style={styles.quickCard}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.quickItem} onPress={() => setModalVisible(true)}>
                  <Ionicons name="add-circle-outline" size={32} color="#4A60FF" />
                  <Text style={styles.quickText}>Add Class</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickItem} onPress={() => setActiveTab("map")}>
                  <Ionicons name="map-outline" size={32} color="#4CAF50" />
                  <Text style={styles.quickText}>View Map</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickItem} onPress={() => setActiveTab("schedule")}>
                  <Ionicons name="calendar-outline" size={32} color="#B37BFF" />
                  <Text style={styles.quickText}>Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.classesBox}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Today's Classes</Text>
                <Text style={styles.dateText}>
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>

              {todayClasses.length === 0 ? (
                <View style={styles.noClassBox}>
                  <Ionicons name="calendar-outline" size={40} color="#bbb" />
                  <Text style={styles.noClassText}>No classes scheduled today</Text>
                </View>
              ) : (
                todayClasses.map((c) => (
                  <View key={c.id} style={styles.classCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.classTitle}>{c.subject}</Text>
                      <Text style={styles.classTime}>{c.time.split(" - ")[0]}</Text>
                    </View>

                    <Text style={styles.instructor}>{c.instructor}</Text>

                    <View style={styles.infoRow}>
                      <Ionicons name="time-outline" size={18} color="#666" />
                      <Text style={styles.infoText}>{c.time}</Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Ionicons name="location-outline" size={18} color="#666" />
                      <Text style={styles.infoText}>{c.room} • {c.building}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.statsRowContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{schedule.length}</Text>
                <Text style={styles.statLabel}>Total Classes</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{schedule.filter(s => s.day === today).length}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
            </View>

          </ScrollView>
        );

      // ---------------- SCHEDULE ----------------
      case "schedule":
        return (
          <ScrollView style={styles.scheduleTab}>

            {/* Top header with add button */}
            <View style={styles.scheduleTopCard}>
              <View>
                <Text style={styles.scheduleTopTitle}>My Schedule</Text>
                <Text style={styles.scheduleTopSubtitle}>{schedule.length} classes this semester</Text>
              </View>

              <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
                <Ionicons name="add" size={22} color="white" />
              </TouchableOpacity>
            </View>

            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => {
              const filtered = schedule.filter((c) => c.day === day);
              if (filtered.length === 0) return null;

              return (
                <View key={day} style={styles.dayGroup}>
                  <Text style={styles.dayLabel}>{day}</Text>

                  {filtered.map((c) => (
                    <View key={c.id} style={styles.scheduleCard}>

                      <View style={styles.rowBetween}>
                        <Text style={styles.subject}>{c.subject}</Text>

                        <View style={{ flexDirection: "row", gap: 12 }}>
                          <TouchableOpacity onPress={() => openEditModal(c)}>
                            <Ionicons name="create-outline" size={20} color="#1A73E8" />
                          </TouchableOpacity>

                          <TouchableOpacity onPress={() => removeClass(c.id)}>
                            <Ionicons name="trash-outline" size={20} color="#D9534F" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.infoRow}>
                        <Ionicons name="time-outline" size={18} color="#555" />
                        <Text style={styles.infoText}>{c.time}</Text>
                      </View>

                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={18} color="#555" />
                        <Text style={styles.infoText}>{c.room} • {c.building}</Text>
                      </View>

                      <View style={styles.infoRow}>
                        <Ionicons name="person-outline" size={18} color="#555" />
                        <Text style={styles.infoText}>{c.instructor}</Text>
                      </View>

                    </View>
                  ))}
                </View>
              );
            })}

          </ScrollView>
        );

      // ---------------- MAP ----------------
      case "map":
        return (
          <View style={{ flex: 1 }}>
            <VisitorMap navigation={navigation} />
          </View>
        );

      // ---------------- PROFILE ----------------
      case "profile":
        return (
          <ScrollView contentContainerStyle={styles.profileContainer}>
            <Ionicons name="person-circle-outline" size={120} color="#4A60FF" />

            <Text style={styles.profileName}>{user.name}</Text>
            <Text style={styles.profileInfo}>{user.role} • {user.idNumber}</Text>

            <View style={styles.profileCard}>
              <Text style={styles.profileSection}>Notifications</Text>
              <Text style={styles.profileSection}>Privacy & Security</Text>
              <Text style={styles.profileSection}>Help & Support</Text>
            </View>

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={() => navigation.replace && navigation.replace("Login")}
            >
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderContent()}

      {/* Add Class Modal */}
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

            <TextInput
              placeholder="Day (e.g. Monday)"
              style={styles.input}
              value={form.day}
              onChangeText={(t) => setForm((f) => ({ ...f, day: t }))}
            />

            <TextInput
              placeholder="e.g. 8:00 AM - 9:30 AM"
              style={styles.input}
              value={form.time}
              onChangeText={(t) => setForm((f) => ({ ...f, time: t }))}
            />

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

      {/* EDIT CLASS MODAL */}
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

            <TextInput
              style={styles.input}
              placeholder="Time"
              value={editForm.time}
              onChangeText={(t) => setEditForm((f) => ({ ...f, time: t }))}
            />

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

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        {["home", "schedule", "map", "profile"].map((tab) => (
          <TouchableOpacity key={tab} style={styles.navItem} onPress={() => setActiveTab(tab)}>
            <Ionicons
              name={
                tab === "home" ? "home-outline" :
                tab === "schedule" ? "calendar-outline" :
                tab === "map" ? "map-outline" :
                "person-outline"
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

/* ------------------------ STYLES ------------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6FA" },

  /* HEADER */
  header: {
    backgroundColor: "#4A60FF",
    padding: 24,
    paddingBottom: 56,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  welcome: { color: "white", fontSize: 16, opacity: 0.95 },
  username: { color: "white", fontSize: 26, fontWeight: "700", marginTop: 6 },
  statusBox: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    padding: 12,
    borderRadius: 12,
    width: '62%'
  },
  statusLabel: { color: "white", opacity: 0.9 },
  statusValue: { color: "white", fontSize: 15, fontWeight: "600", marginTop: 4 },

  /* QUICK ACTIONS */
  quickCard: {
    backgroundColor: "white",
    marginTop: -36,
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 18,
    elevation: 3,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  quickRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  quickItem: { alignItems: "center", width: "30%" },
  quickText: { marginTop: 6, fontSize: 12, color: '#333' },

  /* TODAY CLASSES */
  classesBox: { marginTop: 18, marginHorizontal: 16 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: 'center' },
  dateText: { color: "gray" },

  classCard: { marginTop: 10, backgroundColor: "white", padding: 16, borderRadius: 14, elevation: 2 },
  classTitle: { fontSize: 16, fontWeight: "700" },
  classTime: { color: '#4A60FF', fontWeight: '600' },
  instructor: { marginTop: 6, color: '#555' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  infoText: { marginLeft: 8, color: '#555' },
  noClassBox: { alignItems: 'center', marginTop: 20 },
  noClassText: { color: '#777', marginTop: 8 },

  /* STATS */
  statsRowContainer: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 20 },
  statCard: { backgroundColor: 'white', width: '48%', padding: 18, borderRadius: 18, alignItems: 'center', elevation: 2 },
  statNumber: { fontSize: 28, fontWeight: '800', color: '#4A60FF' },
  statLabel: { color: '#666', marginTop: 6 },

  /* SCHEDULE */
  scheduleTab: { padding: 16 },
  scheduleTopCard: { backgroundColor: '#1A4DDE', padding: 18, borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  scheduleTopTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
  scheduleTopSubtitle: { color: '#E0E6FF', marginTop: 4 },
  addBtn: { backgroundColor: '#0F3CBD', padding: 10, borderRadius: 999 },

  dayGroup: { marginBottom: 18 },
  dayLabel: { fontSize: 16, fontWeight: '700', color: '#555', marginBottom: 10 },

  scheduleCard: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    elevation: 1,
  },
  subject: { fontSize: 16, fontWeight: '700', color: '#222' },
  profileContainer: { alignItems: 'center', padding: 20 },

  /* PROFILE */
  profileName: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  profileInfo: { color: 'gray', marginBottom: 18 },
  profileCard: { width: '100%', backgroundColor: 'white', padding: 16, borderRadius: 12, elevation: 1 },
  profileSection: { fontSize: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  logoutBtn: { backgroundColor: '#FF5A5A', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 16, marginTop: 18 },
  logoutText: { color: 'white', fontWeight: '700' },

  /* BOTTOM NAV */
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'white', paddingVertical: 12, borderRadius: 25, position: 'absolute', bottom: 12, left: 12, right: 12, elevation: 5 },
  navItem: { alignItems: 'center', flex: 1 },
  navLabel: { fontSize: 12, color: '#999', marginTop: 4 },
  navLabelActive: { fontSize: 12, color: '#4A60FF', marginTop: 4 },

  /* MODAL */
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: Platform.OS === 'web' ? '40%' : '90%', backgroundColor: 'white', padding: 18, borderRadius: 12, elevation: 6 },
  modalTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  input: { backgroundColor: '#F6F7FB', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ECECF2' },
  addClassBtn: { backgroundColor: '#0B1020', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  addClassBtnText: { color: 'white', fontWeight: '700' },
  modalClose: { position: 'absolute', top: 10, right: 10 },

});
