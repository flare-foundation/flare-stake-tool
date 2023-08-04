import { privateKeyToEncodedPublicKey } from "../../src/utils"
import data from "../data"
describe("Unit Test Cases for utils", () => {
    describe("privateKeyToEncodedPublicKey Testcases", () => {
        test("Should pass for valid input for privateKey and compres is true", () => {
            const encodedPublicKey = privateKeyToEncodedPublicKey(data.DUMMY_PRIVATE_KEY)
            expect(typeof encodedPublicKey).toBe("string")
        })
        test("Should pass for valid input for privateKey and compress is false", () => {
            const encodedPublicKey = privateKeyToEncodedPublicKey(data.DUMMY_PRIVATE_KEY, false)
            expect(typeof encodedPublicKey).toBe("string")
        })
        test("Should fail for empty privateKey", () => {
            expect(() => {
                privateKeyToEncodedPublicKey('');
            }).toThrow();
        })
    })
})