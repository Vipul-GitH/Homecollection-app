import React from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function OptionSelectModal({
  styles,
  visible,
  title,
  options = [],
  selectedValue,
  onSelect,
  onClose,
  scrollable = true,
  isLoading = false,
  emptyText = 'No options found',
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search',
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
          {typeof onSearchChange === 'function' ? (
            <View style={styles.panelCompanySearchWrap}>
              <Ionicons
                name="search-outline"
                size={16}
                style={styles.panelCompanySearchIcon}
              />
              <TextInput
                value={searchValue}
                onChangeText={onSearchChange}
                placeholder={searchPlaceholder}
                placeholderTextColor="#7B8AA3"
                style={styles.panelCompanySearchInput}
              />
              {searchValue ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => onSearchChange('')}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    style={styles.panelCompanySearchIcon}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <Content {...contentProps}>
            {isLoading || !options.length ? (
              <View style={styles.cancelOptionEmptyState}>
                <Text style={styles.cancelOptionEmptyText}>
                  {isLoading ? 'Loading...' : emptyText}
                </Text>
              </View>
            ) : null}
            {!isLoading && options.map((option, index) => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              const optionKey =
                typeof option === 'string'
                  ? `${option}-${index}`
                  : option.key || `${value}-${index}`;
              const isSelected = selectedValue === value;

              return (
                <TouchableOpacity
                  key={optionKey}
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
