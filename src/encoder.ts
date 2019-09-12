import { assert } from "./asserts";
import * as constants from "./constants";
import * as lib from "./lib";

export class BinaryEncoder {
  private buffer: number[] = [];

  constructor() {}

  /**
   * @return {number}
   */
  length() {
    return this.buffer.length;
  }

  /**
   * @return {!Array<number>}
   */
  end() {
    const buffer = this.buffer;
    this.buffer = [];
    return buffer;
  }

  /**
   * Encodes a 64-bit integer in 32:32 split representation into its wire-format
   * varint representation and stores it in the buffer.
   * @param {number} lowBits The low 32 bits of the int.
   * @param {number} highBits The high 32 bits of the int.
   */
  writeSplitVarint64(lowBits: number, highBits: number) {
    assert(lowBits == Math.floor(lowBits));
    assert(highBits == Math.floor(highBits));
    assert(lowBits >= 0 && lowBits < constants.TWO_TO_32);
    assert(highBits >= 0 && highBits < constants.TWO_TO_32);

    // Break the binary representation into chunks of 7 bits, set the 8th bit
    // in each chunk if it's not the final chunk, and append to the result.
    while (highBits > 0 || lowBits > 127) {
      this.buffer.push((lowBits & 0x7f) | 0x80);
      lowBits = ((lowBits >>> 7) | (highBits << 25)) >>> 0;
      highBits = highBits >>> 7;
    }
    this.buffer.push(lowBits);
  }

  /**
   * Encodes a 64-bit integer in 32:32 split representation into its wire-format
   * fixed representation and stores it in the buffer.
   * @param {number} lowBits The low 32 bits of the int.
   * @param {number} highBits The high 32 bits of the int.
   */
  writeSplitFixed64(lowBits: number, highBits: number) {
    assert(lowBits == Math.floor(lowBits));
    assert(highBits == Math.floor(highBits));
    assert(lowBits >= 0 && lowBits < constants.TWO_TO_32);
    assert(highBits >= 0 && highBits < constants.TWO_TO_32);
    this.writeUint32(lowBits);
    this.writeUint32(highBits);
  }

  /**
   * Encodes a 32-bit unsigned integer into its wire-format varint representation
   * and stores it in the buffer.
   * @param {number} value The integer to convert.
   */
  writeUnsignedVarint32(value: number) {
    assert(value == Math.floor(value));
    assert(value >= 0 && value < constants.TWO_TO_32);

    while (value > 127) {
      this.buffer.push((value & 0x7f) | 0x80);
      value = value >>> 7;
    }

    this.buffer.push(value);
  }

  /**
   * Encodes a 32-bit signed integer into its wire-format varint representation
   * and stores it in the buffer.
   * @param {number} value The integer to convert.
   */
  writeSignedVarint32(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_31 && value < constants.TWO_TO_31);

    // Use the unsigned version if the value is not negative.
    if (value >= 0) {
      this.writeUnsignedVarint32(value);
      return;
    }

    // Write nine bytes with a _signed_ right shift so we preserve the sign bit.
    for (let i = 0; i < 9; i++) {
      this.buffer.push((value & 0x7f) | 0x80);
      value = value >> 7;
    }

    // The above loop writes out 63 bits, so the last byte is always the sign bit
    // which is always set for negative numbers.
    this.buffer.push(1);
  }

  /**
   * Encodes a 64-bit unsigned integer into its wire-format varint representation
   * and stores it in the buffer. Integers that are not representable in 64 bits
   * will be truncated.
   * @param {number} value The integer to convert.
   */
  writeUnsignedVarint64(value: number) {
    assert(value == Math.floor(value));
    assert(value >= 0 && value < constants.TWO_TO_64);
    lib.splitInt64(value);
    this.writeSplitVarint64(lib.split64Low, lib.split64High);
  }

  /**
   * Encodes a 64-bit signed integer into its wire-format varint representation
   * and stores it in the buffer. Integers that are not representable in 64 bits
   * will be truncated.
   * @param {number} value The integer to convert.
   */
  writeSignedVarint64(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_63 && value < constants.TWO_TO_63);
    lib.splitInt64(value);
    this.writeSplitVarint64(lib.split64Low, lib.split64High);
  }

  /**
   * Encodes a JavaScript integer into its wire-format, zigzag-encoded varint
   * representation and stores it in the buffer.
   * @param {number} value The integer to convert.
   */
  writeZigzagVarint32(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_31 && value < constants.TWO_TO_31);
    this.writeUnsignedVarint32(((value << 1) ^ (value >> 31)) >>> 0);
  }

  /**
   * Encodes a JavaScript integer into its wire-format, zigzag-encoded varint
   * representation and stores it in the buffer. Integers not representable in 64
   * bits will be truncated.
   * @param {number} value The integer to convert.
   */
  writeZigzagVarint64(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_63 && value < constants.TWO_TO_63);
    lib.splitZigzag64(value);
    this.writeSplitVarint64(lib.split64Low, lib.split64High);
  }

  /**
   * Encodes a JavaScript decimal string into its wire-format, zigzag-encoded
   * varint representation and stores it in the buffer. Integers not representable
   * in 64 bits will be truncated.
   * @param {string} value The integer to convert.
   */
  writeZigzagVarint64String(value: string) {
    this.writeZigzagVarintHash64(lib.decimalStringToHash64(value));
  }

  /**
   * Writes a 64-bit hash string (8 characters @ 8 bits of data each) to the
   * buffer as a zigzag varint.
   * @param {string} hash The hash to write.
   */
  writeZigzagVarintHash64(hash: string) {
    const self = this;
    lib.splitHash64(hash);
    lib.toZigzag64(lib.split64Low, lib.split64High, (lo, hi) => {
      self.writeSplitVarint64(lo >>> 0, hi >>> 0);
    });
  }

  /**
   * Writes an 8-bit unsigned integer to the buffer. Numbers outside the range
   * [0,2^8) will be truncated.
   * @param {number} value The value to write.
   */
  writeUint8(value: number) {
    assert(value == Math.floor(value));
    assert(value >= 0 && value < 256);
    this.buffer.push((value >>> 0) & 0xff);
  }

  /**
   * Writes a 16-bit unsigned integer to the buffer. Numbers outside the
   * range [0,2^16) will be truncated.
   * @param {number} value The value to write.
   */
  writeUint16(value: number) {
    assert(value == Math.floor(value));
    assert(value >= 0 && value < 65536);
    this.buffer.push((value >>> 0) & 0xff);
    this.buffer.push((value >>> 8) & 0xff);
  }

  /**
   * Writes a 32-bit unsigned integer to the buffer. Numbers outside the
   * range [0,2^32) will be truncated.
   * @param {number} value The value to write.
   */
  writeUint32(value: number) {
    assert(value == Math.floor(value));
    assert(value >= 0 && value < constants.TWO_TO_32);
    this.buffer.push((value >>> 0) & 0xff);
    this.buffer.push((value >>> 8) & 0xff);
    this.buffer.push((value >>> 16) & 0xff);
    this.buffer.push((value >>> 24) & 0xff);
  }

  /**
   * Writes a 64-bit unsigned integer to the buffer. Numbers outside the
   * range [0,2^64) will be truncated.
   * @param {number} value The value to write.
   */
  writeUint64(value: number) {
    assert(value == Math.floor(value));
    assert(value >= 0 && value < constants.TWO_TO_64);
    lib.splitUint64(value);
    this.writeUint32(lib.split64Low);
    this.writeUint32(lib.split64High);
  }

  /**
   * Writes an 8-bit integer to the buffer. Numbers outside the range
   * [-2^7,2^7) will be truncated.
   * @param {number} value The value to write.
   */
  writeInt8(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -128 && value < 128);
    this.buffer.push((value >>> 0) & 0xff);
  }

  /**
   * Writes a 16-bit integer to the buffer. Numbers outside the range
   * [-2^15,2^15) will be truncated.
   * @param {number} value The value to write.
   */
  writeInt16(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -32768 && value < 32768);
    this.buffer.push((value >>> 0) & 0xff);
    this.buffer.push((value >>> 8) & 0xff);
  }

  /**
   * Writes a 32-bit integer to the buffer. Numbers outside the range
   * [-2^31,2^31) will be truncated.
   * @param {number} value The value to write.
   */
  writeInt32(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_31 && value < constants.TWO_TO_31);
    this.buffer.push((value >>> 0) & 0xff);
    this.buffer.push((value >>> 8) & 0xff);
    this.buffer.push((value >>> 16) & 0xff);
    this.buffer.push((value >>> 24) & 0xff);
  }

  /**
   * Writes a 64-bit integer to the buffer. Numbers outside the range
   * [-2^63,2^63) will be truncated.
   * @param {number} value The value to write.
   */
  writeInt64(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_63 && value < constants.TWO_TO_63);
    lib.splitInt64(value);
    this.writeSplitFixed64(lib.split64Low, lib.split64High);
  }

  /**
   * Writes a 64-bit integer decimal strings to the buffer. Numbers outside the
   * range [-2^63,2^63) will be truncated.
   * @param {string} value The value to write.
   */
  writeInt64String(value: string) {
    // assert(value == Math.floor(value));
    assert(+value >= -constants.TWO_TO_63 && +value < constants.TWO_TO_63);
    lib.splitHash64(lib.decimalStringToHash64(value));
    this.writeSplitFixed64(lib.split64Low, lib.split64High);
  }

  /**
   * Writes a single-precision floating point value to the buffer. Numbers
   * requiring more than 32 bits of precision will be truncated.
   * @param {number} value The value to write.
   */
  writeFloat(value: number) {
    assert(value >= -constants.FLOAT32_MAX && value <= constants.FLOAT32_MAX);
    lib.splitFloat32(value);
    this.writeUint32(lib.split64Low);
  }

  /**
   * Writes a double-precision floating point value to the buffer. As this is
   * the native format used by JavaScript, no precision will be lost.
   * @param {number} value The value to write.
   */
  writeDouble(value: number) {
    assert(value >= -constants.FLOAT64_MAX && value <= constants.FLOAT64_MAX);
    lib.splitFloat64(value);
    this.writeUint32(lib.split64Low);
    this.writeUint32(lib.split64High);
  }

  /**
   * Writes a boolean value to the buffer as a varint. We allow numbers as input
   * because the JSPB code generator uses 0/1 instead of true/false to save space
   * in the string representation of the proto.
   * @param {boolean|number} value The value to write.
   */
  writeBool(value: boolean | number) {
    this.buffer.push(value ? 1 : 0);
  }

  /**
   * Writes an enum value to the buffer as a varint.
   * @param {number} value The value to write.
   */
  writeEnum(value: number) {
    assert(value == Math.floor(value));
    assert(value >= -constants.TWO_TO_31 && value < constants.TWO_TO_31);
    this.writeSignedVarint32(value);
  }

  /**
   * Writes an arbitrary byte array to the buffer.
   * @param {!Uint8Array} bytes The array of bytes to write.
   */
  writeBytes(bytes: Uint8Array) {
    this.buffer.push.apply(this.buffer, bytes as any);
  }

  /**
   * Writes a 64-bit hash string (8 characters @ 8 bits of data each) to the
   * buffer as a varint.
   * @param {string} hash The hash to write.
   */
  writeVarintHash64(hash: string) {
    lib.splitHash64(hash);
    this.writeSplitVarint64(lib.split64Low, lib.split64High);
  }

  /**
   * Writes a 64-bit hash string (8 characters @ 8 bits of data each) to the
   * buffer as a fixed64.
   * @param {string} hash The hash to write.
   */
  writeFixedHash64(hash: string) {
    lib.splitHash64(hash);
    this.writeUint32(lib.split64Low);
    this.writeUint32(lib.split64High);
  }

  /**
   * Writes a UTF16 Javascript string to the buffer encoded as UTF8.
   * TODO(aappleby): Add support for surrogate pairs, reject unpaired surrogates.
   * @param {string} value The string to write.
   * @return {number} The number of bytes used to encode the string.
   */
  writeString(value: string) {
    const oldLength = this.buffer.length;

    for (let i = 0; i < value.length; i++) {
      let c = value.charCodeAt(i);

      if (c < 128) {
        this.buffer.push(c);
      } else if (c < 2048) {
        this.buffer.push((c >> 6) | 192);
        this.buffer.push((c & 63) | 128);
      } else if (c < 65536) {
        // Look for surrogates
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length) {
          const second = value.charCodeAt(i + 1);
          if (second >= 0xdc00 && second <= 0xdfff) {
            // low surrogate
            // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
            c = (c - 0xd800) * 0x400 + second - 0xdc00 + 0x10000;

            this.buffer.push((c >> 18) | 240);
            this.buffer.push(((c >> 12) & 63) | 128);
            this.buffer.push(((c >> 6) & 63) | 128);
            this.buffer.push((c & 63) | 128);
            i++;
          }
        } else {
          this.buffer.push((c >> 12) | 224);
          this.buffer.push(((c >> 6) & 63) | 128);
          this.buffer.push((c & 63) | 128);
        }
      }
    }

    const length = this.buffer.length - oldLength;
    return length;
  }
}
