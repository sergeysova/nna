import { ByteSource } from "./constants";
import { assert, AssertionError } from "./asserts";
import * as lib from "./lib";

export class BinaryDecoder {
  private static instanceCache: BinaryDecoder[] = [];

  /**
   * Pops an instance off the instance cache, or creates one if the cache is
   * empty.
   * @param bytes The bytes we're reading from.
   * @param start The optional offset to start reading at.
   * @param length The optional length of the block to read -
   *     we'll throw an assertion if we go off the end of the block.
   */
  static alloc(
    bytes?: ByteSource,
    start?: number,
    length?: number,
  ): BinaryDecoder {
    if (BinaryDecoder.instanceCache.length) {
      const newDecoder = BinaryDecoder.instanceCache.pop() as BinaryDecoder;
      if (bytes) {
        newDecoder.setBlock(bytes, start, length);
      }
      return newDecoder;
    } else {
      return new BinaryDecoder(bytes, start, length);
    }
  }

  private bytes?: Uint8Array = undefined;
  private start = 0;
  private end = 0;
  private cursor = 0;
  private error = false;

  constructor(bytes?: ByteSource, start?: number, length?: number) {
    if (bytes) {
      this.setBlock(bytes, start, length);
    }
  }

  /**
   * Puts this instance back in the instance cache.
   */
  free() {
    this.clear();
    if (BinaryDecoder.instanceCache.length < 100) {
      BinaryDecoder.instanceCache.push(this);
    }
  }

  /**
   * Makes a copy of this decoder.
   */
  clone() {
    return BinaryDecoder.alloc(this.bytes, this.start, this.end - this.start);
  }

  /**
   * Clears the decoder.
   */
  clear() {
    this.bytes = undefined;
    this.start = 0;
    this.end = 0;
    this.cursor = 0;
    this.error = false;
  }
  /**
   * Returns the raw buffer.
   */
  getBuffer(): Uint8Array | void {
    return this.bytes;
  }

  /**
   * Changes the block of bytes we're decoding.
   * @param data The bytes we're reading from.
   * @param start The optional offset to start reading at.
   * @param length The optional length of the block to read -
   *     we'll throw an assertion if we go off the end of the block.
   */
  setBlock(data: ByteSource, start?: number, length?: number) {
    this.bytes = lib.byteSourceToUint8Array(data);
    this.start = start || 0;
    this.end = length !== undefined ? this.start + length : this.bytes.length;
    this.cursor = this.start;
  }

  getEnd(): number {
    return this.end;
  }

  setEnd(end: number) {
    this.end = end;
  }

  /**
   * Moves the read cursor back to the start of the block.
   */
  reset() {
    this.cursor = this.start;
  }

  getCursor(): number {
    return this.cursor;
  }

  setCursor(cursor: number) {
    this.cursor = cursor;
  }

  /**
   * Advances the stream cursor by the given number of bytes.
   * @param count The number of bytes to advance by.
   */
  advance(count: number) {
    this.cursor += count;
    assert(this.cursor <= this.end);
  }

  /**
   * Returns true if this decoder is at the end of the block.
   */
  atEnd(): boolean {
    return this.cursor === this.end;
  }

  /**
   * Returns true if this decoder is at the end of the block.
   */
  pastEnd(): boolean {
    return this.cursor > this.end;
  }

  /**
   * Returns true if this decoder encountered an error due to corrupt data.
   */
  getError(): boolean {
    return this.error || this.cursor < 0 || this.cursor > this.end;
  }

  /**
   * Reads an unsigned varint from the binary stream and invokes the conversion
   * function with the value in two signed 32 bit integers to produce the result.
   * Since this does not convert the value to a number, no precision is lost.
   *
   * It's possible for an unsigned varint to be incorrectly encoded - more than
   * 64 bits' worth of data could be present. If this happens, this method will
   * throw an error.
   *
   * Decoding varints requires doing some funny base-128 math - for more
   * details on the format, see
   * https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @param convert Conversion function to produce
   *     the result value, takes parameters (lowBits, highBits).
   */
  readSplitVarint64<T>(convert: (lowBits: number, highBits: number) => T): T {
    var temp = 128;
    var lowBits = 0;
    var highBits = 0;

    if (this.bytes) {
      // Read the first four bytes of the varint, stopping at the terminator if we
      // see it.
      for (var i = 0; i < 4 && temp >= 128; i++) {
        temp = this.bytes[this.cursor++];
        lowBits |= (temp & 0x7f) << (i * 7);
      }

      if (temp >= 128) {
        // Read the fifth byte, which straddles the low and high dwords.
        temp = this.bytes[this.cursor++];
        lowBits |= (temp & 0x7f) << 28;
        highBits |= (temp & 0x7f) >> 4;
      }

      if (temp >= 128) {
        // Read the sixth through tenth byte.
        for (var i = 0; i < 5 && temp >= 128; i++) {
          temp = this.bytes[this.cursor++];
          highBits |= (temp & 0x7f) << (i * 7 + 3);
        }
      }

      if (temp < 128) {
        return convert(lowBits >>> 0, highBits >>> 0);
      }

      // If we did not see the terminator, the encoding was invalid.
      throw new AssertionError(
        "Failed to read varint, encoding is invalid.",
        [],
      );
      this.error = true;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a signed zigzag encoded varint from the binary stream and invokes
   * the conversion function with the value in two signed 32 bit integers to
   * produce the result. Since this does not convert the value to a number, no
   * precision is lost.
   *
   * It's possible for an unsigned varint to be incorrectly encoded - more than
   * 64 bits' worth of data could be present. If this happens, this method will
   * throw an error.
   *
   * Zigzag encoding is a modification of varint encoding that reduces the
   * storage overhead for small negative integers - for more details on the
   * format, see https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @param {function(number, number): T} convert Conversion function to produce
   *     the result value, takes parameters (lowBits, highBits).
   * @return {T}
   * @template T
   */
  readSplitZigzagVarint64<T>(
    convert: (lowBits: number, highBits: number) => T,
  ): T {
    return this.readSplitVarint64(function(low, high) {
      return lib.fromZigzag64(low, high, convert);
    });
  }

  readSplitFixed64<T>(convert: (lowBits: number, highBits: number) => T): T {
    if (this.bytes) {
      var bytes = this.bytes;
      var cursor = this.cursor;
      this.cursor += 8;
      var lowBits = 0;
      var highBits = 0;
      for (var i = cursor + 7; i >= cursor; i--) {
        lowBits = (lowBits << 8) | bytes[i];
        highBits = (highBits << 8) | bytes[i + 4];
      }
      return convert(lowBits, highBits);
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Skips over a varint in the block without decoding it.
   */
  skipVarint() {
    if (this.bytes) {
      while (this.bytes[this.cursor] & 0x80) {
        this.cursor++;
      }
      this.cursor++;
    }
  }

  /**
   * Skips backwards over a varint in the block - to do this correctly, we have
   * to know the value we're skipping backwards over or things are ambiguous.
   * @param {number} value The varint value to unskip.
   */
  unskipVarint(value: number) {
    while (value > 128) {
      this.cursor--;
      value = value >>> 7;
    }
    this.cursor--;
  }

  /**
   * Reads a 32-bit varint from the binary stream. Due to a quirk of the encoding
   * format and Javascript's handling of bitwise math, this actually works
   * correctly for both signed and unsigned 32-bit varints.
   *
   * This function is called vastly more frequently than any other in
   * BinaryDecoder, so it has been unrolled and tweaked for performance.
   *
   * If there are more than 32 bits of data in the varint, it _must_ be due to
   * sign-extension. If we're in debug mode and the high 32 bits don't match the
   * expected sign extension, this method will throw an error.
   *
   * Decoding varints requires doing some funny base-128 math - for more
   * details on the format, see
   * https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @return {number} The decoded unsigned 32-bit varint.
   */
  readUnsignedVarint32(): number {
    var temp;
    var bytes = this.bytes;
    if (bytes) {
      temp = bytes[this.cursor + 0];
      var x = temp & 0x7f;
      if (temp < 128) {
        this.cursor += 1;
        assert(this.cursor <= this.end);
        return x;
      }

      temp = bytes[this.cursor + 1];
      x |= (temp & 0x7f) << 7;
      if (temp < 128) {
        this.cursor += 2;
        assert(this.cursor <= this.end);
        return x;
      }

      temp = bytes[this.cursor + 2];
      x |= (temp & 0x7f) << 14;
      if (temp < 128) {
        this.cursor += 3;
        assert(this.cursor <= this.end);
        return x;
      }

      temp = bytes[this.cursor + 3];
      x |= (temp & 0x7f) << 21;
      if (temp < 128) {
        this.cursor += 4;
        assert(this.cursor <= this.end);
        return x;
      }

      temp = bytes[this.cursor + 4];
      x |= (temp & 0x0f) << 28;
      if (temp < 128) {
        // We're reading the high bits of an unsigned varint. The byte we just read
        // also contains bits 33 through 35, which we're going to discard.
        this.cursor += 5;
        assert(this.cursor <= this.end);
        return x >>> 0;
      }

      // If we get here, we need to truncate coming bytes. However we need to make
      // sure cursor place is correct.
      this.cursor += 5;
      if (
        bytes[this.cursor++] >= 128 &&
        bytes[this.cursor++] >= 128 &&
        bytes[this.cursor++] >= 128 &&
        bytes[this.cursor++] >= 128 &&
        bytes[this.cursor++] >= 128
      ) {
        // If we get here, the varint is too long.
        assert(false);
      }

      assert(this.cursor <= this.end);
      return x;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * The readUnsignedVarint32 above deals with signed 32-bit varints correctly,
   * so this is just an alias.
   *
   * @return {number} The decoded signed 32-bit varint.
   */
  readSignedVarint32() {
    return this.readUnsignedVarint32();
  }

  /**
   * Reads a 32-bit unsigned variant and returns its value as a string.
   *
   * @return {string} The decoded unsigned 32-bit varint as a string.
   */
  readUnsignedVarint32String(): string {
    // 32-bit integers fit in JavaScript numbers without loss of precision, so
    // string variants of 32-bit varint readers can simply delegate then convert
    // to string.
    var value = this.readUnsignedVarint32();
    return value.toString();
  }

  /**
   * Reads a 32-bit signed variant and returns its value as a string.
   *
   * @return {string} The decoded signed 32-bit varint as a string.
   */
  readSignedVarint32String(): string {
    // 32-bit integers fit in JavaScript numbers without loss of precision, so
    // string variants of 32-bit varint readers can simply delegate then convert
    // to string.
    var value = this.readSignedVarint32();
    return value.toString();
  }

  /**
   * Reads a signed, zigzag-encoded 32-bit varint from the binary stream.
   *
   * Zigzag encoding is a modification of varint encoding that reduces the
   * storage overhead for small negative integers - for more details on the
   * format, see https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @return {number} The decoded signed, zigzag-encoded 32-bit varint.
   */
  readZigzagVarint32(): number {
    var result = this.readUnsignedVarint32();
    return (result >>> 1) ^ -(result & 1);
  }

  /**
   * Reads an unsigned 64-bit varint from the binary stream. Note that since
   * Javascript represents all numbers as double-precision floats, there will be
   * precision lost if the absolute value of the varint is larger than 2^53.
   *
   * @return {number} The decoded unsigned varint. Precision will be lost if the
   *     integer exceeds 2^53.
   */
  readUnsignedVarint64() {
    return this.readSplitVarint64(lib.joinUint64);
  }

  /**
   * Reads an unsigned 64-bit varint from the binary stream and returns the value
   * as a decimal string.
   *
   * @return {string} The decoded unsigned varint as a decimal string.
   */
  readUnsignedVarint64String(): string {
    return this.readSplitVarint64(lib.joinUnsignedDecimalString);
  }

  /**
   * Reads a signed 64-bit varint from the binary stream. Note that since
   * Javascript represents all numbers as double-precision floats, there will be
   * precision lost if the absolute value of the varint is larger than 2^53.
   *
   * @return {number} The decoded signed varint. Precision will be lost if the
   *     integer exceeds 2^53.
   */
  readSignedVarint64(): number {
    return this.readSplitVarint64(lib.joinInt64);
  }

  /**
   * Reads an signed 64-bit varint from the binary stream and returns the value
   * as a decimal string.
   *
   * @return {string} The decoded signed varint as a decimal string.
   */
  readSignedVarint64String() {
    return this.readSplitVarint64(lib.joinSignedDecimalString);
  }

  /**
   * Reads a signed, zigzag-encoded 64-bit varint from the binary stream. Note
   * that since Javascript represents all numbers as double-precision floats,
   * there will be precision lost if the absolute value of the varint is larger
   * than 2^53.
   *
   * Zigzag encoding is a modification of varint encoding that reduces the
   * storage overhead for small negative integers - for more details on the
   * format, see https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @return {number} The decoded zigzag varint. Precision will be lost if the
   *     integer exceeds 2^53.
   */
  readZigzagVarint64() {
    return this.readSplitVarint64(lib.joinZigzag64);
  }

  /**
   * Reads a signed, zigzag-encoded 64-bit varint from the binary stream
   * losslessly and returns it as an 8-character Unicode string for use as a hash
   * table key.
   *
   * Zigzag encoding is a modification of varint encoding that reduces the
   * storage overhead for small negative integers - for more details on the
   * format, see https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @return {string} The decoded zigzag varint in hash64 format.
   */
  readZigzagVarintHash64(): string {
    return this.readSplitZigzagVarint64(lib.joinHash64);
  }

  /**
   * Reads a signed, zigzag-encoded 64-bit varint from the binary stream and
   * returns its value as a string.
   *
   * Zigzag encoding is a modification of varint encoding that reduces the
   * storage overhead for small negative integers - for more details on the
   * format, see https://developers.google.com/protocol-buffers/docs/encoding
   *
   * @return {string} The decoded signed, zigzag-encoded 64-bit varint as a
   * string.
   */
  readZigzagVarint64String() {
    return this.readSplitZigzagVarint64(lib.joinSignedDecimalString);
  }

  /**
   * Reads a raw unsigned 8-bit integer from the binary stream.
   *
   * @return {number} The unsigned 8-bit integer read from the binary stream.
   */
  readUint8() {
    if (this.bytes) {
      var a = this.bytes[this.cursor + 0];
      this.cursor += 1;
      assert(this.cursor <= this.end);
      return a;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a raw unsigned 16-bit integer from the binary stream.
   *
   * @return {number} The unsigned 16-bit integer read from the binary stream.
   */
  readUint16() {
    if (this.bytes) {
      var a = this.bytes[this.cursor + 0];
      var b = this.bytes[this.cursor + 1];
      this.cursor += 2;
      assert(this.cursor <= this.end);
      return (a << 0) | (b << 8);
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a raw unsigned 32-bit integer from the binary stream.
   *
   * @return {number} The unsigned 32-bit integer read from the binary stream.
   */
  readUint32() {
    if (this.bytes) {
      var a = this.bytes[this.cursor + 0];
      var b = this.bytes[this.cursor + 1];
      var c = this.bytes[this.cursor + 2];
      var d = this.bytes[this.cursor + 3];
      this.cursor += 4;
      assert(this.cursor <= this.end);
      return ((a << 0) | (b << 8) | (c << 16) | (d << 24)) >>> 0;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a raw unsigned 64-bit integer from the binary stream. Note that since
   * Javascript represents all numbers as double-precision floats, there will be
   * precision lost if the absolute value of the integer is larger than 2^53.
   *
   * @return {number} The unsigned 64-bit integer read from the binary stream.
   *     Precision will be lost if the integer exceeds 2^53.
   */
  readUint64() {
    var bitsLow = this.readUint32();
    var bitsHigh = this.readUint32();
    return lib.joinUint64(bitsLow, bitsHigh);
  }

  /**
   * Reads a raw unsigned 64-bit integer from the binary stream. Note that since
   * Javascript represents all numbers as double-precision floats, there will be
   * precision lost if the absolute value of the integer is larger than 2^53.
   *
   * @return {string} The unsigned 64-bit integer read from the binary stream.
   */
  readUint64String() {
    var bitsLow = this.readUint32();
    var bitsHigh = this.readUint32();
    return lib.joinUnsignedDecimalString(bitsLow, bitsHigh);
  }

  /**
   * Reads a raw signed 8-bit integer from the binary stream.
   *
   * @return {number} The signed 8-bit integer read from the binary stream.
   */
  readInt8() {
    if (this.bytes) {
      var a = this.bytes[this.cursor + 0];
      this.cursor += 1;
      assert(this.cursor <= this.end);
      return (a << 24) >> 24;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a raw signed 16-bit integer from the binary stream.
   *
   * @return {number} The signed 16-bit integer read from the binary stream.
   */
  readInt16() {
    if (this.bytes) {
      var a = this.bytes[this.cursor + 0];
      var b = this.bytes[this.cursor + 1];
      this.cursor += 2;
      assert(this.cursor <= this.end);
      return (((a << 0) | (b << 8)) << 16) >> 16;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a raw signed 32-bit integer from the binary stream.
   *
   * @return {number} The signed 32-bit integer read from the binary stream.
   */
  readInt32() {
    if (this.bytes) {
      var a = this.bytes[this.cursor + 0];
      var b = this.bytes[this.cursor + 1];
      var c = this.bytes[this.cursor + 2];
      var d = this.bytes[this.cursor + 3];
      this.cursor += 4;
      assert(this.cursor <= this.end);
      return (a << 0) | (b << 8) | (c << 16) | (d << 24);
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a raw signed 64-bit integer from the binary stream. Note that since
   * Javascript represents all numbers as double-precision floats, there will be
   * precision lost if the absolute vlaue of the integer is larger than 2^53.
   *
   * @return {number} The signed 64-bit integer read from the binary stream.
   *     Precision will be lost if the integer exceeds 2^53.
   */
  readInt64() {
    var bitsLow = this.readUint32();
    var bitsHigh = this.readUint32();
    return lib.joinInt64(bitsLow, bitsHigh);
  }

  /**
   * Reads a raw signed 64-bit integer from the binary stream and returns it as a
   * string.
   *
   * @return {string} The signed 64-bit integer read from the binary stream.
   *     Precision will be lost if the integer exceeds 2^53.
   */
  readInt64String() {
    var bitsLow = this.readUint32();
    var bitsHigh = this.readUint32();
    return lib.joinSignedDecimalString(bitsLow, bitsHigh);
  }

  /**
   * Reads a 32-bit floating-point number from the binary stream, using the
   * temporary buffer to realign the data.
   *
   * @return {number} The float read from the binary stream.
   */
  readFloat() {
    var bitsLow = this.readUint32();
    var bitsHigh = 0;
    return lib.joinFloat32(bitsLow, bitsHigh);
  }

  /**
   * Reads a 64-bit floating-point number from the binary stream, using the
   * temporary buffer to realign the data.
   *
   * @return {number} The double read from the binary stream.
   */
  readDouble() {
    var bitsLow = this.readUint32();
    var bitsHigh = this.readUint32();
    return lib.joinFloat64(bitsLow, bitsHigh);
  }

  /**
   * Reads a boolean value from the binary stream.
   * @return {boolean} The boolean read from the binary stream.
   */
  readBool() {
    return this.bytes ? !!this.bytes[this.cursor++] : false;
  }

  /**
   * Reads an enum value from the binary stream, which are always encoded as
   * signed varints.
   * @return {number} The enum value read from the binary stream.
   */
  readEnum() {
    return this.readSignedVarint32();
  }

  /**
   * Reads and parses a UTF-8 encoded unicode string from the stream.
   * The code is inspired by maps.vectortown.parse.StreamedDataViewReader.
   * Supports codepoints from U+0000 up to U+10FFFF.
   * (http://en.wikipedia.org/wiki/UTF-8).
   * @param {number} length The length of the string to read.
   * @return {string} The decoded string.
   */
  readString(length: number): string {
    var bytes = this.bytes;
    var cursor = this.cursor;
    var end = cursor + length;
    var codeUnits = [];

    if (bytes) {
      var result = "";
      while (cursor < end) {
        var c = bytes[cursor++];
        if (c < 128) {
          // Regular 7-bit ASCII.
          codeUnits.push(c);
        } else if (c < 192) {
          // UTF-8 continuation mark. We are out of sync. This
          // might happen if we attempted to read a character
          // with more than four bytes.
          continue;
        } else if (c < 224) {
          // UTF-8 with two bytes.
          var c2 = bytes[cursor++];
          codeUnits.push(((c & 31) << 6) | (c2 & 63));
        } else if (c < 240) {
          // UTF-8 with three bytes.
          var c2 = bytes[cursor++];
          var c3 = bytes[cursor++];
          codeUnits.push(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
        } else if (c < 248) {
          // UTF-8 with 4 bytes.
          var c2 = bytes[cursor++];
          var c3 = bytes[cursor++];
          var c4 = bytes[cursor++];
          // Characters written on 4 bytes have 21 bits for a codepoint.
          // We can't fit that on 16bit characters, so we use surrogates.
          var codepoint =
            ((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
          // Surrogates formula from wikipedia.
          // 1. Subtract 0x10000 from codepoint
          codepoint -= 0x10000;
          // 2. Split this into the high 10-bit value and the low 10-bit value
          // 3. Add 0xD800 to the high value to form the high surrogate
          // 4. Add 0xDC00 to the low value to form the low surrogate:
          var low = (codepoint & 1023) + 0xdc00;
          var high = ((codepoint >> 10) & 1023) + 0xd800;
          codeUnits.push(high, low);
        }

        // Avoid exceeding the maximum stack size when calling `apply`.
        if (codeUnits.length >= 8192) {
          result += String.fromCharCode.apply(null, codeUnits);
          codeUnits.length = 0;
        }
      }
      result += lib.byteArrayToString(codeUnits);
      this.cursor = cursor;
      return result;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads and parses a UTF-8 encoded unicode string (with length prefix) from
   * the stream.
   * @return {string} The decoded string.
   */
  readStringWithLength() {
    var length = this.readUnsignedVarint32();
    return this.readString(length);
  }

  /**
   * Reads a block of raw bytes from the binary stream.
   *
   * @param {number} length The number of bytes to read.
   * @return {!Uint8Array} The decoded block of bytes, or an empty block if the
   *     length was invalid.
   */
  readBytes(length: number): Uint8Array {
    if (this.bytes) {
      if (length < 0 || this.cursor + length > this.bytes.length) {
        this.error = true;
        throw new TypeError("Invalid byte length!");
      }

      var result = this.bytes.subarray(this.cursor, this.cursor + length);

      this.cursor += length;
      assert(this.cursor <= this.end);
      return result;
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }

  /**
   * Reads a 64-bit varint from the stream and returns it as an 8-character
   * Unicode string for use as a hash table key.
   *
   * @return {string} The hash value.
   */
  readVarintHash64() {
    return this.readSplitVarint64(lib.joinHash64);
  }

  /**
   * Reads a 64-bit fixed-width value from the stream and returns it as an
   * 8-character Unicode string for use as a hash table key.
   *
   * @return {string} The hash value.
   */
  readFixedHash64() {
    if (this.bytes) {
      var bytes = this.bytes;
      var cursor = this.cursor;

      var a = bytes[cursor + 0];
      var b = bytes[cursor + 1];
      var c = bytes[cursor + 2];
      var d = bytes[cursor + 3];
      var e = bytes[cursor + 4];
      var f = bytes[cursor + 5];
      var g = bytes[cursor + 6];
      var h = bytes[cursor + 7];

      this.cursor += 8;

      return String.fromCharCode(a, b, c, d, e, f, g, h);
    }
    throw new TypeError("BinaryDecoder do not contains any bytes.");
  }
}
