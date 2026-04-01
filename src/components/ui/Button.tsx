import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { COLORS } from '../../lib/constants';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        styles[variant],
        styles[`${size}Size`],
        isDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? COLORS.primary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.text,
            styles[`${variant}Text`],
            styles[`${size}Text`],
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: COLORS.accent,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  smallSize: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  mediumSize: {
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  largeSize: {
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: COLORS.text,
  },
  ghostText: {
    color: COLORS.primary,
  },
  smallText: {
    fontSize: 13,
  },
  mediumText: {
    fontSize: 15,
  },
  largeText: {
    fontSize: 16,
  },
});
