# Tube Barcode Print Format

This document describes the tube label barcode format used by the Home Collection APK.

## Where labels are printed

Tube labels are printed from the Sample Collection screen using the saved default printer from Profile > Printer.

Only selected/collected tube rows are sent for printing. Child tests inside the same tube do not create separate labels; one physical tube should produce one label.

## Barcode value format

The printed barcode value is generated per patient tube.

### Booking barcode

```text
YY + BookingId + CenterId + PatientSequence + "-" + TubeSequence
```

Example:

```text
2632111-1
```

Meaning:

- `26` = financial year short code
- `321` = booking id
- `1` = center id, currently hardcoded
- `1` = patient sequence
- `-1` = tube sequence

### Appointment barcode

For linked appointment/source type `APPOINTMENT`, financial year is replaced by `0`.

```text
0 + AppointmentId + CenterId + PatientSequence + "-" + TubeSequence
```

Example:

```text
078111-1
```

Meaning:

- `0` = appointment prefix
- `781` = appointment id
- `1` = center id, currently hardcoded
- `1` = patient sequence
- `-1` = tube sequence

## Sequence rules

### Patient sequence

Patient sequence is stable once generated.

The app first tries to reuse:

1. saved patient sequence map
2. current patient sample collection draft
3. existing tube barcode map
4. patient list order
5. next unused sequence

Drafts are scoped by source and id:

```text
BOOKING:{bookingId}
APPOINTMENT:{appointmentId}
```

This prevents tube barcode cache from mixing between booking and appointment records, even when numeric ids are same.

### Tube sequence

Tube sequence is stable once generated.

Tube cache key:

```text
specimen:{tubeName}
additional:{tubeName}
```

Examples:

```text
specimen:edta
specimen:plain
additional:edta
```

If a tube is removed/unselected later, its old barcode record can stay in the map, but it should not go in payload unless that tube is selected again. If the same tube is selected again, the app reuses the old tube code.

## Label content

Each printed label contains:

```text
Patient name with title
Barcode graphic
Barcode text
Age + Gender
Print date + Tube name
Phlebo name on right side, rotated
```

Example visual content:

```text
JUSTIC SAHIL BISHT
|||||||||||||||||||
2632111-1
24 Yrs Male
06/08/2026 EDTA
```

Phlebo name is printed vertically on the right edge in small text.

## TSPL printer layout

Printer setup:

```text
SIZE 50 mm,25 mm
GAP 2 mm,0 mm
SPEED 5
DENSITY 10
DIRECTION 0
REFERENCE 0,0
GAPDETECT
```

Per-label commands:

```text
CLS
TEXT 24,16,"1",0,1,1,"{patientName}"
BARCODE 24,42,"128",46,0,0,2,2,"{barcode}"
TEXT 24,92,"1",0,1,1,"{barcodeText}"
TEXT 24,120,"1",0,1,1,"{ageGender}"
TEXT 24,146,"1",0,1,1,"{dateText} {tubeName}"
TEXT 362,176,"0",270,1,1,"{phleboName}"
PRINT 1,1
```

Text limits before sending to printer:

- patient name: 24 characters
- age/gender: 18 characters
- tube name: 22 characters
- date: 12 characters
- phlebo name: 12 characters
- barcode: alphanumeric and `-`, max 32 characters

## Complete booking payload

Completed normal tubes are sent in `cmplt_tube` with tube name and barcode:

```json
{
  "cmplt_tube": ["EDTA-2632111-1", "Plain-2632111-2"]
}
```

Additional tubes are not sent in `cmplt_tube`. They are sent in `additional_sample`:

```json
{
  "additional_sample": "Flu-R-2632111-3"
}
```

## Main code locations

- Barcode generation: `screens/bookings/SampleCollectionScreen.js`
- Label TSPL commands: `android/app/src/main/java/com/homecollection/PrinterModule.kt`
- Complete booking tube payload: `screens/bookings/AppointmentDetailsScreen.js`
- Draft/cache key: `hooks/useAppShellController.js`
