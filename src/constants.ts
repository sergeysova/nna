import { BinaryReader } from "./reader";
import { BinaryWriter } from "./writer";
import { Message } from "./message";

export declare class Buffer implements ArrayBuffer {
  [Symbol.toStringTag]: string;
  readonly byteLength: number;
  slice(begin: number, end?: number): ArrayBuffer;
}

/**
 * Base interface class for all const messages.
 * @interface
 */
export interface ConstBinaryMessage {
  /**
   * Generate a debug string for this proto that is in proto2 text format.
   */
  toDebugString(): string;

  /**
   * Helper to generate a debug string for this proto at some indent level. The
   * first line is not indented.
   * @param indentLevel The number of spaces by which to indent lines.
   * @return The debug string.
   * @protected
   */
  toDebugStringInternal(indentLevel: number): string;
}

/**
 * Base interface class for all messages. Does __not__ define any methods, as
 * doing so on a widely-used interface defeats dead-code elimination.
 * @interface
 */
export interface BinaryMessage extends ConstBinaryMessage {}

/**
 * The types convertible to Uint8Arrays. Strings are assumed to be
 * base64-encoded.
 */
export type ByteSource = ArrayBuffer | Buffer | Uint8Array | number[] | string;

/**
 * A scalar field can be a boolean, number, or string.
 */
export type ScalarFieldType = boolean | number | string;

/**
 * A repeated field in jspb is an array of scalars, blobs, or messages.
 */
export type RepeatedFieldType =
  | ScalarFieldType[]
  | Uint8Array[]
  | ConstBinaryMessage[]
  | BinaryMessage[];

/**
 * A field in jspb can be a scalar, a block of bytes, another proto, or an
 * array of any of the above.
 */
export type AnyFieldType =
  | ScalarFieldType
  | RepeatedFieldType
  | Uint8Array
  | ConstBinaryMessage
  | BinaryMessage;

/**
 * A builder function creates an instance of a message object.
 */
export type BuilderFunction = () => BinaryMessage;

/**
 * A cloner function creates a deep copy of a message object.
 */
export type ClonerFunction = (msg: ConstBinaryMessage) => BinaryMessage;

/**
 * A recycler function destroys an instance of a message object.
 */
export type RecyclerFunction = (msg: BinaryMessage) => void;

/**
 * A reader function initializes a message using data from a BinaryReader.
 */
export type ReaderFunction = (msg: BinaryMessage, reader: BinaryReader) => void;

/**
 * A writer function serializes a message to a BinaryWriter.
 */
export type WriterFunction = (
  msg: Message | ConstBinaryMessage,
  writer: BinaryWriter,
) => void;

/**
 * A pruner function removes default-valued fields and empty submessages from a
 * message and returns either the pruned message or null if the entire message
 * was pruned away.
 */
export type PrunerFunction = (
  msg: BinaryMessage | null,
) => BinaryMessage | null;

/**
 * A comparer function returns true if two protos are equal.
 */
export type ComparerFunction = (
  left: ConstBinaryMessage,
  right: ConstBinaryMessage,
) => boolean;

/**
 * Field type codes, taken from proto2/public/wire_format_lite.h.
 */
export type FieldType = {
  INVALID: -1;
  DOUBLE: 1;
  FLOAT: 2;
  INT64: 3;
  UINT64: 4;
  INT32: 5;
  FIXED64: 6;
  FIXED32: 7;
  BOOL: 8;
  STRING: 9;
  GROUP: 10;
  MESSAGE: 11;
  BYTES: 12;
  UINT32: 13;
  ENUM: 14;
  SFIXED32: 15;
  SFIXED64: 16;
  SINT32: 17;
  SINT64: 18;

  // Extended types for Javascript

  FHASH64: 30; // 64-bit hash string, fixed-length encoding.
  VHASH64: 31; // 64-bit hash string, varint encoding.
};

export const FieldType: FieldType = {
  INVALID: -1,
  DOUBLE: 1,
  FLOAT: 2,
  INT64: 3,
  UINT64: 4,
  INT32: 5,
  FIXED64: 6,
  FIXED32: 7,
  BOOL: 8,
  STRING: 9,
  GROUP: 10,
  MESSAGE: 11,
  BYTES: 12,
  UINT32: 13,
  ENUM: 14,
  SFIXED32: 15,
  SFIXED64: 16,
  SINT32: 17,
  SINT64: 18,

  // Extended types for Javascript

  FHASH64: 30, // 64-bit hash string, fixed-length encoding.
  VHASH64: 31, // 64-bit hash string, varint encoding.
};

/**
 * Wire-format type codes, taken from proto2/public/wire_format_lite.h.
 */
export type WireType = {
  INVALID: -1;
  VARINT: 0;
  FIXED64: 1;
  DELIMITED: 2;
  START_GROUP: 3;
  END_GROUP: 4;
  FIXED32: 5;
};
export const WireType: WireType = {
  INVALID: -1,
  VARINT: 0,
  FIXED64: 1,
  DELIMITED: 2,
  START_GROUP: 3,
  END_GROUP: 4,
  FIXED32: 5,
};

/**
 * Translates field type to wire type.
 * @param {jspb.BinaryConstants.FieldType} fieldType
 * @return {jspb.BinaryConstants.WireType}
 */
export const fieldTypeToWireType = <T extends keyof FieldType>(
  fieldType: FieldType[T],
) => {
  var fieldTypes = FieldType;
  var wireTypes = WireType;
  switch (fieldType) {
    case fieldTypes.INT32:
    case fieldTypes.INT64:
    case fieldTypes.UINT32:
    case fieldTypes.UINT64:
    case fieldTypes.SINT32:
    case fieldTypes.SINT64:
    case fieldTypes.BOOL:
    case fieldTypes.ENUM:
    case fieldTypes.VHASH64:
      return wireTypes.VARINT;

    case fieldTypes.DOUBLE:
    case fieldTypes.FIXED64:
    case fieldTypes.SFIXED64:
    case fieldTypes.FHASH64:
      return wireTypes.FIXED64;

    case fieldTypes.STRING:
    case fieldTypes.MESSAGE:
    case fieldTypes.BYTES:
      return wireTypes.DELIMITED;

    case fieldTypes.FLOAT:
    case fieldTypes.FIXED32:
    case fieldTypes.SFIXED32:
      return wireTypes.FIXED32;

    case fieldTypes.INVALID:
    case fieldTypes.GROUP:
    default:
      return wireTypes.INVALID;
  }
};

/**
 * The smallest denormal float32 value.
 * @const {number}
 */
export const FLOAT32_EPS = 1.401298464324817e-45;

/**
 * The smallest normal float64 value.
 * @const {number}
 */
export const FLOAT32_MIN = 1.1754943508222875e-38;

/**
 * The largest finite float32 value.
 * @const {number}
 */
export const FLOAT32_MAX = 3.4028234663852886e38;

/**
 * The smallest denormal float64 value.
 * @const {number}
 */
export const FLOAT64_EPS = 5e-324;

/**
 * The smallest normal float64 value.
 * @const {number}
 */
export const FLOAT64_MIN = 2.2250738585072014e-308;

/**
 * The largest finite float64 value.
 * @const {number}
 */
export const FLOAT64_MAX = 1.7976931348623157e308;

/**
 * Convenience constant equal to 2^20.
 * @const {number}
 */
export const TWO_TO_20 = 1048576;

/**
 * Convenience constant equal to 2^23.
 * @const {number}
 */
export const TWO_TO_23 = 8388608;

/**
 * Convenience constant equal to 2^31.
 * @const {number}
 */
export const TWO_TO_31 = 2147483648;

/**
 * Convenience constant equal to 2^32.
 * @const {number}
 */
export const TWO_TO_32 = 4294967296;

/**
 * Convenience constant equal to 2^52.
 * @const {number}
 */
export const TWO_TO_52 = 4503599627370496;

/**
 * Convenience constant equal to 2^63.
 * @const {number}
 */
export const TWO_TO_63 = 9223372036854775808;

/**
 * Convenience constant equal to 2^64.
 * @const {number}
 */
export const TWO_TO_64 = 18446744073709551616;

/**
 * Eight-character string of zeros, used as the default 64-bit hash value.
 * @const {string}
 */
export const ZERO_HASH = "\0\0\0\0\0\0\0\0";
