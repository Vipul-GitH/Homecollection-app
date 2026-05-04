import React from 'react';
import {Image, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function BottomTabBar({
  tabs,
  activeTab,
  onTabPress,
  styles,
  isSmallPhone,
}) {
  return (
    <View style={[styles.bottomBar, !isSmallPhone && styles.bottomBarWide]}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;

        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.85}
            style={[styles.tabButton, isActive && styles.tabButtonActive]}
            onPress={() => onTabPress(tab.key)}>
            <View style={[styles.tabIcon, isActive && styles.tabIconActive]}>
              {tab.image ? (
                <Image
                  source={{uri: tab.image}}
                  style={[
                    styles.tabIconImage,
                    isActive && styles.tabIconImageActive,
                  ]}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons
                  name={isActive ? tab.activeIcon || tab.icon : tab.icon}
                  size={18}
                  style={[
                    styles.tabIconText,
                    isActive && styles.tabIconTextActive,
                  ]}
                />
              )}
            </View>
            <Text
              style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
