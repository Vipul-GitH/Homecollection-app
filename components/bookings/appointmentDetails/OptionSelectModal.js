import React from 'react';
import {Modal, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function OptionSelectModal({
  styles,
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  scrollable = true,
}) {
  const Content = scrollable ? ScrollView : View;
  const contentProps = scrollable
    ? {
        showsVerticalScrollIndicator: false,
        contentContainerStyle: styles.cancelOptionList,
      }
    : {style: styles.cancelOptionList};

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.cancelOptionOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.cancelOptionBackdrop}
          onPress={onClose}
        />
        <View style={styles.cancelOptionSheet}>
          <View style={styles.cancelOptionHeader}>
            <Text style={styles.cancelOptionTitle}>{title}</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.cancelOptionCloseButton}
              onPress={onClose}>
              <Ionicons
                name="close"
                size={18}
                style={styles.cancelOptionCloseIcon}
              />
            </TouchableOpacity>
          </View>
          <Content {...contentProps}>
            {options.map(option => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              const isSelected = selectedValue === value;

              return (
                <TouchableOpacity
                  key={value}
                  activeOpacity={0.85}
                  style={[
                    styles.cancelSelectOption,
                    isSelected && styles.cancelSelectOptionActive,
                  ]}
                  onPress={() => onSelect(value)}>
                  <Text
                    style={[
                      styles.cancelSelectOptionText,
                      isSelected && styles.cancelSelectOptionTextActive,
                    ]}>
                    {label}
                  </Text>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      style={styles.cancelSelectOptionIcon}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Content>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(OptionSelectModal);
