export const TITLE_OPTIONS = [
  'Mr',
  'Mrs',
  'Ms',
  'Dr',
  'Master',
  'Baby',
  'Justice',
  'Other',
];

export const TAG_OPTIONS = ['VIP', 'High Value', 'Urgent'];
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
export const EDITABLE_GENDER_TITLES = ['Baby', 'Justice', 'Other'];
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const INITIAL_PATIENT_FORM = {
  title: 'Mr',
  fullName: '',
  gender: 'Male',
  dateOfBirth: '',
  ageYears: '',
  primaryMobile: '',
  alternateMobile: '',
  email: '',
  labmatePid: '',
  panelCompany: 'CGHS',
  tag: 'VIP',
};

export const DUMMY_LINKED_PATIENTS = [
  {
    id: 'linked-1',
    name: 'Aarav Sharma',
    gender: 'Male',
    age: '34',
    mobileNumber: '9876543210',
    panelCompany: 'CGHS',
  },
  {
    id: 'linked-2',
    name: 'Priya Verma',
    gender: 'Female',
    age: '29',
    mobileNumber: '9811122233',
    panelCompany: 'ECHS',
  },
  {
    id: 'linked-3',
    name: 'Mohit Khan',
    gender: 'Male',
    age: '41',
    mobileNumber: '9898989898',
    panelCompany: 'Corporate Panel',
  },
];

export const PANEL_COMPANY_DEFAULT_VISIBLE = 4;
export const PANEL_COMPANY_SEARCH_VISIBLE_LIMIT = 40;
export const CATALOG_TEST_VISIBLE_LIMIT = 10;
export const CATALOG_ITEM_PAGE_SIZE = 10;
export const MIN_ADD_TEST_LOADING_MS = 2000;
