import type { ReactNode } from "react";
import React from "react";

type NativeProps = {
  children?: ReactNode;
  [key: string]: unknown;
};

export function Pressable({ children, ...props }: NativeProps) {
  return React.createElement("Pressable", props, children);
}

export function SafeAreaView({ children, ...props }: NativeProps) {
  return React.createElement("SafeAreaView", props, children);
}

export function ScrollView({ children, ...props }: NativeProps) {
  return React.createElement("ScrollView", props, children);
}

export function Text({ children, ...props }: NativeProps) {
  return React.createElement("Text", props, children);
}

export function TextInput(props: NativeProps) {
  return React.createElement("TextInput", props);
}

export function View({ children, ...props }: NativeProps) {
  return React.createElement("View", props, children);
}

export function Image(props: NativeProps) {
  return React.createElement("Image", props);
}

export const Linking = {
  openURL: async () => undefined
};

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  }
};
