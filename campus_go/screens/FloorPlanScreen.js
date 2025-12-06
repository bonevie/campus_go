// FloorPlanScreen.js
import React from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function FloorPlanScreen({ route, navigation }) {
  const { building } = route.params;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{building.name}</Text>
      </View>

      {building.department && (
        <Text style={styles.department}>Department: {building.department}</Text>
      )}

      {building.floorPlan ? (
        <Image
          source={{ uri: building.floorPlan }}
          style={styles.floorPlanImage}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.noFloorPlan}>No floor plan available</Text>
      )}

      {building.rooms?.length > 0 && (
        <View style={styles.roomsContainer}>
          <Text style={styles.roomsHeader}>Rooms:</Text>
          {building.rooms.map((room, i) => (
            <Text key={i} style={styles.roomItem}>
              • {room}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f9", paddingTop: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "#1faa59",
  },
  headerTitle: { color: "white", fontSize: 20, fontWeight: "700", marginLeft: 15 },
  department: {
    marginTop: 15,
    marginHorizontal: 20,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  floorPlanImage: {
    width: "90%",
    height: 300,
    marginHorizontal: "5%",
    marginTop: 20,
    borderRadius: 12,
  },
  noFloorPlan: {
    textAlign: "center",
    marginTop: 30,
    fontSize: 16,
    color: "#777",
  },
  roomsContainer: {
    marginTop: 20,
    marginHorizontal: 20,
  },
  roomsHeader: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
    color: "#2e7d32",
  },
  roomItem: {
    fontSize: 14,
    marginBottom: 4,
    color: "#555",
  },
});
