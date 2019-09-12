import { BinaryDecoder } from "./decoder";
import { BinaryEncoder } from "./encoder";

/**
 * Tests encoding and decoding of unsigned types.
 * @param {Function} readValue
 * @param {Function} writeValue
 * @param {number} epsilon
 * @param {number} upperLimit
 * @param {Function} filter
 * @suppress {missingProperties|visibility}
 */
function doTestUnsignedValue(
  readValue: Function,
  writeValue: Function,
  epsilon: number,
  upperLimit: number,
  filter: Function,
) {
  var encoder = new BinaryEncoder();

  // Encode zero and limits.
  writeValue.call(encoder, filter(0));
  writeValue.call(encoder, filter(epsilon));
  writeValue.call(encoder, filter(upperLimit));

  // Encode positive values.
  for (var cursor = epsilon; cursor < upperLimit; cursor *= 1.1) {
    writeValue.call(encoder, filter(cursor));
  }

  var decoder = BinaryDecoder.alloc(encoder.end());

  // Check zero and limits.
  assertEquals(filter(0), readValue.call(decoder));
  assertEquals(filter(epsilon), readValue.call(decoder));
  assertEquals(filter(upperLimit), readValue.call(decoder));

  // Check positive values.
  for (var cursor = epsilon; cursor < upperLimit; cursor *= 1.1) {
    if (filter(cursor) != readValue.call(decoder)) throw "fail!";
  }

  // Encoding values outside the valid range should assert.
  assertThrows(function() {
    writeValue.call(encoder, -1);
  });
  assertThrows(function() {
    writeValue.call(encoder, upperLimit * 1.1);
  });
}

/**
 * Tests encoding and decoding of signed types.
 * @param {Function} readValue
 * @param {Function} writeValue
 * @param {number} epsilon
 * @param {number} lowerLimit
 * @param {number} upperLimit
 * @param {Function} filter
 * @suppress {missingProperties}
 */
function doTestSignedValue(
  readValue,
  writeValue,
  epsilon,
  lowerLimit,
  upperLimit,
  filter,
) {
  var encoder = new BinaryEncoder();

  // Encode zero and limits.
  writeValue.call(encoder, filter(lowerLimit));
  writeValue.call(encoder, filter(-epsilon));
  writeValue.call(encoder, filter(0));
  writeValue.call(encoder, filter(epsilon));
  writeValue.call(encoder, filter(upperLimit));

  var inputValues = [];

  // Encode negative values.
  for (var cursor = lowerLimit; cursor < -epsilon; cursor /= 1.1) {
    var val = filter(cursor);
    writeValue.call(encoder, val);
    inputValues.push(val);
  }

  // Encode positive values.
  for (var cursor = epsilon; cursor < upperLimit; cursor *= 1.1) {
    var val = filter(cursor);
    writeValue.call(encoder, val);
    inputValues.push(val);
  }

  var decoder = BinaryDecoder.alloc(encoder.end());

  // Check zero and limits.
  assertEquals(filter(lowerLimit), readValue.call(decoder));
  assertEquals(filter(-epsilon), readValue.call(decoder));
  assertEquals(filter(0), readValue.call(decoder));
  assertEquals(filter(epsilon), readValue.call(decoder));
  assertEquals(filter(upperLimit), readValue.call(decoder));

  // Verify decoded values.
  for (var i = 0; i < inputValues.length; i++) {
    assertEquals(inputValues[i], readValue.call(decoder));
  }

  // Encoding values outside the valid range should assert.
  assertThrows(function() {
    writeValue.call(encoder, lowerLimit * 1.1);
  });
  assertThrows(function() {
    writeValue.call(encoder, upperLimit * 1.1);
  });
}

describe("binaryDecoderTest", function() {
  /**
   * Tests the decoder instance cache.
   */
  it("testInstanceCache", /** @suppress {visibility} */ function() {
    // Empty the instance caches.
    BinaryDecoder.instanceCache_ = [];

    // Allocating and then freeing a decoder should put it in the instance
    // cache.
    BinaryDecoder.alloc().free();

    assertEquals(1, BinaryDecoder.instanceCache_.length);

    // Allocating and then freeing three decoders should leave us with three in
    // the cache.

    var decoder1 = BinaryDecoder.alloc();
    var decoder2 = BinaryDecoder.alloc();
    var decoder3 = BinaryDecoder.alloc();
    decoder1.free();
    decoder2.free();
    decoder3.free();

    assertEquals(3, BinaryDecoder.instanceCache_.length);
  });

  describe("varint64", function() {
    var /** !BinaryEncoder */ encoder;
    var /** !BinaryDecoder */ decoder;

    var hashA = String.fromCharCode(
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    );
    var hashB = String.fromCharCode(
      0x12,
      0x34,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    );
    var hashC = String.fromCharCode(
      0x12,
      0x34,
      0x56,
      0x78,
      0x87,
      0x65,
      0x43,
      0x21,
    );
    var hashD = String.fromCharCode(
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
    );
    beforeEach(function() {
      encoder = new BinaryEncoder();

      encoder.writeVarintHash64(hashA);
      encoder.writeVarintHash64(hashB);
      encoder.writeVarintHash64(hashC);
      encoder.writeVarintHash64(hashD);

      encoder.writeFixedHash64(hashA);
      encoder.writeFixedHash64(hashB);
      encoder.writeFixedHash64(hashC);
      encoder.writeFixedHash64(hashD);

      decoder = BinaryDecoder.alloc(encoder.end());
    });

    it("reads 64-bit integers as hash strings", function() {
      assertEquals(hashA, decoder.readVarintHash64());
      assertEquals(hashB, decoder.readVarintHash64());
      assertEquals(hashC, decoder.readVarintHash64());
      assertEquals(hashD, decoder.readVarintHash64());

      assertEquals(hashA, decoder.readFixedHash64());
      assertEquals(hashB, decoder.readFixedHash64());
      assertEquals(hashC, decoder.readFixedHash64());
      assertEquals(hashD, decoder.readFixedHash64());
    });

    it("reads split 64 bit integers", function() {
      function hexJoin(bitsLow, bitsHigh) {
        return `0x${(bitsHigh >>> 0).toString(16)}:0x${(bitsLow >>> 0).toString(
          16,
        )}`;
      }
      function hexJoinHash(hash64) {
        utils.splitHash64(hash64);
        return hexJoin(utils.split64Low, utils.split64High);
      }

      expect(decoder.readSplitVarint64(hexJoin)).toEqual(hexJoinHash(hashA));
      expect(decoder.readSplitVarint64(hexJoin)).toEqual(hexJoinHash(hashB));
      expect(decoder.readSplitVarint64(hexJoin)).toEqual(hexJoinHash(hashC));
      expect(decoder.readSplitVarint64(hexJoin)).toEqual(hexJoinHash(hashD));

      expect(decoder.readSplitFixed64(hexJoin)).toEqual(hexJoinHash(hashA));
      expect(decoder.readSplitFixed64(hexJoin)).toEqual(hexJoinHash(hashB));
      expect(decoder.readSplitFixed64(hexJoin)).toEqual(hexJoinHash(hashC));
      expect(decoder.readSplitFixed64(hexJoin)).toEqual(hexJoinHash(hashD));
    });
  });

  describe("sint64", function() {
    var /** !BinaryDecoder */ decoder;

    var hashA = String.fromCharCode(
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    );
    var hashB = String.fromCharCode(
      0x12,
      0x34,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    );
    var hashC = String.fromCharCode(
      0x12,
      0x34,
      0x56,
      0x78,
      0x87,
      0x65,
      0x43,
      0x21,
    );
    var hashD = String.fromCharCode(
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
    );
    beforeEach(function() {
      var encoder = new BinaryEncoder();

      encoder.writeZigzagVarintHash64(hashA);
      encoder.writeZigzagVarintHash64(hashB);
      encoder.writeZigzagVarintHash64(hashC);
      encoder.writeZigzagVarintHash64(hashD);

      decoder = BinaryDecoder.alloc(encoder.end());
    });

    it("reads 64-bit integers as decimal strings", function() {
      const signed = true;
      expect(decoder.readZigzagVarint64String()).toEqual(
        utils.hash64ToDecimalString(hashA, signed),
      );
      expect(decoder.readZigzagVarint64String()).toEqual(
        utils.hash64ToDecimalString(hashB, signed),
      );
      expect(decoder.readZigzagVarint64String()).toEqual(
        utils.hash64ToDecimalString(hashC, signed),
      );
      expect(decoder.readZigzagVarint64String()).toEqual(
        utils.hash64ToDecimalString(hashD, signed),
      );
    });

    it("reads 64-bit integers as hash strings", function() {
      expect(decoder.readZigzagVarintHash64()).toEqual(hashA);
      expect(decoder.readZigzagVarintHash64()).toEqual(hashB);
      expect(decoder.readZigzagVarintHash64()).toEqual(hashC);
      expect(decoder.readZigzagVarintHash64()).toEqual(hashD);
    });

    it("reads split 64 bit zigzag integers", function() {
      function hexJoin(bitsLow, bitsHigh) {
        return `0x${(bitsHigh >>> 0).toString(16)}:0x${(bitsLow >>> 0).toString(
          16,
        )}`;
      }
      function hexJoinHash(hash64) {
        utils.splitHash64(hash64);
        return hexJoin(utils.split64Low, utils.split64High);
      }

      expect(decoder.readSplitZigzagVarint64(hexJoin)).toEqual(
        hexJoinHash(hashA),
      );
      expect(decoder.readSplitZigzagVarint64(hexJoin)).toEqual(
        hexJoinHash(hashB),
      );
      expect(decoder.readSplitZigzagVarint64(hexJoin)).toEqual(
        hexJoinHash(hashC),
      );
      expect(decoder.readSplitZigzagVarint64(hexJoin)).toEqual(
        hexJoinHash(hashD),
      );
    });

    it("does zigzag encoding properly", function() {
      // Test cases direcly from the protobuf dev guide.
      // https://engdoc.corp.google.com/eng/howto/protocolbuffers/developerguide/encoding.shtml?cl=head#types
      var testCases = [
        { original: "0", zigzag: "0" },
        { original: "-1", zigzag: "1" },
        { original: "1", zigzag: "2" },
        { original: "-2", zigzag: "3" },
        { original: "2147483647", zigzag: "4294967294" },
        { original: "-2147483648", zigzag: "4294967295" },
        // 64-bit extremes, not in dev guide.
        { original: "9223372036854775807", zigzag: "18446744073709551614" },
        { original: "-9223372036854775808", zigzag: "18446744073709551615" },
      ];
      var encoder = new BinaryEncoder();
      testCases.forEach(function(c) {
        encoder.writeZigzagVarint64String(c.original);
      });
      var buffer = encoder.end();
      var zigzagDecoder = BinaryDecoder.alloc(buffer);
      var varintDecoder = BinaryDecoder.alloc(buffer);
      testCases.forEach(function(c) {
        expect(zigzagDecoder.readZigzagVarint64String()).toEqual(c.original);
        expect(varintDecoder.readUnsignedVarint64String()).toEqual(c.zigzag);
      });
    });
  });

  /**
   * Tests reading and writing large strings
   */
  it("testLargeStrings", function() {
    var encoder = new BinaryEncoder();

    var len = 150000;
    var long_string = "";
    for (var i = 0; i < len; i++) {
      long_string += "a";
    }

    encoder.writeString(long_string);

    var decoder = BinaryDecoder.alloc(encoder.end());

    assertEquals(long_string, decoder.readString(len));
  });

  /**
   * Test encoding and decoding utf-8.
   */
  it("testUtf8", function() {
    var encoder = new BinaryEncoder();

    var ascii = "ASCII should work in 3, 2, 1...";
    var utf8_two_bytes = "©";
    var utf8_three_bytes = "❄";
    var utf8_four_bytes = "😁";

    encoder.writeString(ascii);
    encoder.writeString(utf8_two_bytes);
    encoder.writeString(utf8_three_bytes);
    encoder.writeString(utf8_four_bytes);

    var decoder = BinaryDecoder.alloc(encoder.end());

    assertEquals(ascii, decoder.readString(ascii.length));
    assertEquals(utf8_two_bytes, decoder.readString(utf8_two_bytes.length));
    assertEquals(utf8_three_bytes, decoder.readString(utf8_three_bytes.length));
    assertEquals(utf8_four_bytes, decoder.readString(utf8_four_bytes.length));
  });

  /**
   * Verifies that misuse of the decoder class triggers assertions.
   */
  it("testDecodeErrors", function() {
    // Reading a value past the end of the stream should trigger an assertion.
    var decoder = BinaryDecoder.alloc([0, 1, 2]);
    assertThrows(function() {
      decoder.readUint64();
    });

    // Overlong varints should trigger assertions.
    decoder.setBlock([
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      255,
      0,
    ]);
    assertThrows(function() {
      decoder.readUnsignedVarint64();
    });
    decoder.reset();
    assertThrows(function() {
      decoder.readSignedVarint64();
    });
    decoder.reset();
    assertThrows(function() {
      decoder.readZigzagVarint64();
    });
    decoder.reset();
    assertThrows(function() {
      decoder.readUnsignedVarint32();
    });
  });

  /**
   * Tests encoding and decoding of unsigned integers.
   */
  it("testUnsignedIntegers", function() {
    doTestUnsignedValue(
      BinaryDecoder.prototype.readUint8,
      BinaryEncoder.prototype.writeUint8,
      1,
      0xff,
      Math.round,
    );

    doTestUnsignedValue(
      BinaryDecoder.prototype.readUint16,
      BinaryEncoder.prototype.writeUint16,
      1,
      0xffff,
      Math.round,
    );

    doTestUnsignedValue(
      BinaryDecoder.prototype.readUint32,
      BinaryEncoder.prototype.writeUint32,
      1,
      0xffffffff,
      Math.round,
    );

    doTestUnsignedValue(
      BinaryDecoder.prototype.readUint64,
      BinaryEncoder.prototype.writeUint64,
      1,
      Math.pow(2, 64) - 1025,
      Math.round,
    );
  });

  /**
   * Tests encoding and decoding of signed integers.
   */
  it("testSignedIntegers", function() {
    doTestSignedValue(
      BinaryDecoder.prototype.readInt8,
      BinaryEncoder.prototype.writeInt8,
      1,
      -0x80,
      0x7f,
      Math.round,
    );

    doTestSignedValue(
      BinaryDecoder.prototype.readInt16,
      BinaryEncoder.prototype.writeInt16,
      1,
      -0x8000,
      0x7fff,
      Math.round,
    );

    doTestSignedValue(
      BinaryDecoder.prototype.readInt32,
      BinaryEncoder.prototype.writeInt32,
      1,
      -0x80000000,
      0x7fffffff,
      Math.round,
    );

    doTestSignedValue(
      BinaryDecoder.prototype.readInt64,
      BinaryEncoder.prototype.writeInt64,
      1,
      -Math.pow(2, 63),
      Math.pow(2, 63) - 513,
      Math.round,
    );
  });

  /**
   * Tests encoding and decoding of floats.
   */
  it("testFloats", function() {
    /**
     * @param {number} x
     * @return {number}
     */
    function truncate(x) {
      var temp = new Float32Array(1);
      temp[0] = x;
      return temp[0];
    }
    doTestSignedValue(
      BinaryDecoder.prototype.readFloat,
      BinaryEncoder.prototype.writeFloat,
      BinaryConstants.FLOAT32_EPS,
      -BinaryConstants.FLOAT32_MAX,
      BinaryConstants.FLOAT32_MAX,
      truncate,
    );

    doTestSignedValue(
      BinaryDecoder.prototype.readDouble,
      BinaryEncoder.prototype.writeDouble,
      BinaryConstants.FLOAT64_EPS * 10,
      -BinaryConstants.FLOAT64_MAX,
      BinaryConstants.FLOAT64_MAX,
      function(x) {
        return x;
      },
    );
  });
});
