import React, { createContext, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const BuildingsContext = createContext();

export default function VisitorMap({ navigation }) {
  const [buildings, setBuildings] = useState([
    {
      id: 1,
      name: "Engineering Building",
      dept: "College of Engineering",
      rooms: ["ENG 101", "ENG 102", "Dean's Office"],
      x: 80,
      y: 140,
    },
    {
      id: 2,
      name: "ICT Building",
      dept: "Information & Communications Tech",
      rooms: ["Lab 1", "Lab 2", "Server Room"],
      x: 200,
      y: 230,
    },
  ]);

  return (
    <BuildingsContext.Provider value={{ buildings, setBuildings }}>
      <View style={styles.container}>

        {/* HEADER WITH BACK BUTTON */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Campus Map</Text>
          </View>

          <Text style={styles.headerSubtitle}>
            Visitor Mode • Explore the campus
          </Text>

          {/* SEARCH BAR */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#666" />
            <TextInput
              placeholder="Search buildings, offices, rooms…"
              style={styles.searchInput}
            />
          </View>
        </View>

        {/* SCROLLABLE CONTENT */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* FAKE MAP SECTION */}
          <View style={styles.mapCard}>
            <Text style={styles.mapHint}>Tap a building to view details</Text>

            {buildings.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.buildingBubble, { top: b.y, left: b.x }]}
              >
                <Ionicons name="business" size={20} color="#0a4d22" />
                <Text style={styles.mapBubbleLabel}>
                  {b.name.split(" ")[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* SECTION TITLE */}
          <Text style={styles.sectionTitle}>All Campus Buildings</Text>

          {/* BUILDING LIST */}
          {buildings.map((b) => (
            <View key={b.id} style={styles.buildingCard}>
              <View style={styles.buildingRow}>
                <View style={styles.buildingIconContainer}>
                  <Ionicons name="business" size={22} color="#2e7d32" />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.buildingName}>{b.name}</Text>
                  <Text style={styles.buildingDept}>{b.dept}</Text>

                  <View style={styles.roomsRow}>
                    {b.rooms.map((r, i) => (
                      <Text key={i} style={styles.roomChip}>
                        {r}
                      </Text>
                    ))}
                  </View>
                </View>

                <Ionicons name="navigate" size={22} color="#2e7d32" />
              </View>
            </View>
          ))}

          {/* EXTRA FEATURES CARD */}
          <View style={styles.featuresCard}>
            <Text style={styles.featuresTitle}>Need More Features?</Text>
            <Text style={styles.featuresSubtitle}>
              Create an account to access class schedules, personalized
              navigation, and more!
            </Text>


          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </BuildingsContext.Provider>
  );
}

// COLORS
const green = "#1faa59";
const lightGreen = "#dbffe3";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f9" },

  header: {
    backgroundColor: green,
    paddingTop: 55,
    paddingBottom: 25,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
  },

  headerSubtitle: {
    color: "#ddffdd",
    marginTop: 4,
    marginBottom: 15,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 40,
  },

  searchInput: { marginLeft: 8, flex: 1 },

  mapCard: {
    marginTop: 20,
    marginHorizontal: 20,
    height: 330,
    backgroundColor: lightGreen,
    borderRadius: 20,
    padding: 10,
    position: "relative",
  },

  mapHint: {
    position: "absolute",
    bottom: 10,
    left: 10,
    fontSize: 12,
    opacity: 0.6,
  },

  buildingBubble: {
    position: "absolute",
    width: 70,
    height: 70,
    backgroundColor: "white",
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },

  mapBubbleLabel: {
    fontSize: 11,
    marginTop: 3,
    color: "#0a4d22",
    fontWeight: "600",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 25,
    marginLeft: 20,
  },

  buildingCard: {
    backgroundColor: "white",
    marginHorizontal: 20,
    marginTop: 12,
    padding: 15,
    borderRadius: 18,
    elevation: 2,
  },

  buildingRow: { flexDirection: "row", alignItems: "flex-start" },

  buildingIconContainer: {
    width: 45,
    height: 45,
    backgroundColor: lightGreen,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  buildingName: { fontSize: 16, fontWeight: "700" },

  buildingDept: { color: "#555", fontSize: 12, marginBottom: 6 },

  roomsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  roomChip: {
    backgroundColor: "#eef6ef",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 11,
    color: "#2e7d32",
  },

  featuresCard: {
    backgroundColor: "#fff8dc",
    marginTop: 20,
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffe7a3",
  },

  featuresTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 5,
  },

  featuresSubtitle: {
    fontSize: 13,
    color: "#444",
    marginBottom: 15,
  },

  accountButton: {
    backgroundColor: "#ffcc00",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
  },

  accountButtonText: {
    fontWeight: "700",
    color: "#333",
  },
});
