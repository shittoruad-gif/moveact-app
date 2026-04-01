import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { STORES, COLORS } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingWebView'>;

export function BookingWebViewScreen({ route }: Props) {
  const { selectedStore } = useStoreSelection();
  const storeId = route.params?.storeId ?? selectedStore;
  const bookingUrl = STORES[storeId].bookingUrl;
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
      <WebView
        source={{ uri: bookingUrl }}
        style={styles.webview}
        onLoadEnd={() => setLoading(false)}
        startInLoadingState={false}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    zIndex: 1,
  },
});
