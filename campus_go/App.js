import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Login from "./screens/Login";
import SignUp from "./screens/SignUp";
import VisitorMap from "./screens/VisitorMap";
import AdminDashboard from "./screens/AdminDashboard";
import UserDashboard from "./screens/UserDashboard";
import PrivacySecurity from "./screens/PrivacySecurity";
import AllBuildings from "./screens/AllBuildings";
import FloorPlanScreen from "./screens/FloorPlanScreen";

import { BuildingsProvider } from "./screens/BuildingsContext";

const Stack = createNativeStackNavigator();

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.warn('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <BuildingsProvider>
        <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="SignUp" component={SignUp} />
          <Stack.Screen name="VisitorMap" component={VisitorMap} />
          <Stack.Screen name="AllBuildings" component={AllBuildings} />
          <Stack.Screen name="FloorPlanScreen" component={FloorPlanScreen} />
          <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
          <Stack.Screen name="UserDashboard" component={UserDashboard} />
          <Stack.Screen name="PrivacySecurity" component={PrivacySecurity} />
        </Stack.Navigator>
        </NavigationContainer>
      </BuildingsProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
