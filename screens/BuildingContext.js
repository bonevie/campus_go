// BuildingsContext.js
import React, { createContext, useState } from "react";

export const BuildingsContext = createContext();

export const BuildingsProvider = ({ children }) => {
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
      {children}
    </BuildingsContext.Provider>
  );
};
