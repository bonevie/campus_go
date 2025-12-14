// BuildingsContext.js
// Updated to support kind: "building" | "gate", color, type, isMainGate, gateIcon.
// Backwards-compatible with older saved data since Admin/Visitor code also normalizes on load.

import React, { createContext, useState } from "react";

export const BuildingsContext = createContext();

export const BuildingsProvider = ({ children }) => {
  const initial = [
    {
      id: 1,
      kind: "building",
      name: "Gym",
      department: "Physical Education",
      status: "open",
      rooms: [],
      x: 290,
      y: 10,
      stepsFromMainGate: 1000,
      floorPlan: null,
      type: "general",
      color: "#ffd54f",
    },
    {
      id: 2,
      kind: "building",
      name: "CBM Building",
      department: "Business Management",
      status: "open",
      rooms: [],
      x: 230,
      y: 80,
      stepsFromMainGate: 550,
      floorPlan: null,
      type: "general",
      color: "#e57373",
    },
    {
      id: 3,
      kind: "building",
      name: "CTE Building",
      department: "Teacher Education",
      status: "open",
      rooms: [],
      x: 305,
      y: 80,
      stepsFromMainGate: 500,
      floorPlan: null,
      type: "general",
      color: "#4fc3f7",
    },
    {
      id: 4,
      kind: "building",
      name: "Admin Building",
      department: "Administration",
      status: "open",
      rooms: [],
      x: 390,
      y: 80,
      stepsFromMainGate: 450,
      floorPlan: null,
      type: "office",
      color: "#6a11cb",
    },
    {
      id: 5,
      kind: "building",
      name: "ROTC Office",
      department: "Reserve Officers Training Corps",
      status: "open",
      rooms: [],
      x: 120,
      y: 100,
      stepsFromMainGate: 300,
      floorPlan: null,
      type: "office",
      color: "#ff8800",
    },
    {
      id: 6,
      kind: "building",
      name: "Automotive Shop",
      department: "Automotive Tech",
      status: "open",
      rooms: [],
      x: 90,
      y: 90,
      stepsFromMainGate: 245,
      floorPlan: null,
      type: "general",
      color: "#1faa59",
    },
    {
      id: 7,
      kind: "building",
      name: "CTECH Building",
      department: "Computer Technology",
      status: "open",
      rooms: [
        "IT RM 1",
        "Faculty Office",
        "Lab B",
        "Lab C",
        "Multimedia",
        "Dean's Office",
        "CR",
      ],
      x: 400,
      y: 150,
      stepsFromMainGate: 100,
      floorPlan: null,
      type: "general",
      color: "#1faa59",
    },
    // Gates now stored as kind: "gate"
    {
      id: 8,
      kind: "gate",
      name: "Entrance Gate",
      department: "",
      status: "open",
      rooms: [],
      x: 370,
      y: 250,
      stepsFromMainGate: 100,
      floorPlan: null,
      isMainGate: true, // primary
      gateIcon: null,
    },
    {
      id: 9,
      kind: "gate",
      name: "Exit Gate",
      department: "",
      status: "open",
      rooms: [],
      x: 130,
      y: 250,
      stepsFromMainGate: 0,
      floorPlan: null,
      isMainGate: false,
      gateIcon: null,
    },
  ];

  // Expose buildings and setter (AdminDashboard and VisitorMap will sync to AsyncStorage)
  const [buildings, setBuildings] = useState(initial);

  return (
    <BuildingsContext.Provider value={{ buildings, setBuildings }}>
      {children}
    </BuildingsContext.Provider>
  );
};
